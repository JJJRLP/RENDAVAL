import 'server-only';
import { ApiError, vaultKey } from '../env';
import { USDC } from '../../stellar/assets';
import { a, apiCall, balance, BOND, BOOK, bool, bytes, i, invoke, issuerKey, read, readClosedLoan, rpcServer, RULES, sym, USD, verifyCode, VAULT_HASH, BOOK_HASH } from './chain';
import { get, update, digest } from './store';
import { indexKey, ownBond, ownLoan, verified } from './records';
import { lenderKey, tw } from './network';
import { terminal, type Config, type Index, type Series, type Spec, type VaultConfig, type View } from './types';
export async function accept(wallet: string, bondId: string) {
  await verified(wallet);
  const b = await ownBond(wallet, bondId);
  if (!await get(`approved:${bondId}`)) throw new ApiError(409, 'El bono requiere aprobación explícita.');
  const idx = await update<Index>(indexKey(wallet), async old => {
    const idx = old!;
    let open = 0;
    for (const item of idx.loans) {
      if (!item.id) { open++; if (item.bondId === bondId) return idx; continue; }
      const config = await read<VaultConfig>(item.id, 'get_config');
      if (config.state[0] === 'Pending') { open++; if (item.bondId === bondId) return idx; }
      if (config.state[0] === 'Closed' && item.bondId === bondId) {
        const prior = await readClosedLoan<View>(item.id);
        if (prior && ['Liquidated', 'WrittenOff'].includes(prior.loan.status[0])) throw new ApiError(409, 'Los bonos de esta declaración ya fueron ejecutados. Declare otra garantía.');
      }
      if (config.state[0] === 'Active') {
        open++;
        if (item.bondId === bondId) throw new ApiError(409, 'El bono ya garantiza un préstamo.');
      }
    }
    if (open >= 3) throw new ApiError(409, 'Máximo tres préstamos abiertos por empresa.');
    // Series is fungible RBOND, but each declaration is reserved only once at a time.
    idx.loans.push({ ref: digest(`${bondId}:${idx.loans.length}`), bondId });
    return idx;
  });
  const item = idx.loans.filter(l => l.bondId === bondId).at(-1)!;
  const principal = BigInt(b.face) / 2n;
  const result = await invoke(`create:${item.ref}`, vaultKey(), BOOK, 'create_vault', [bytes(Buffer.from(item.ref, 'hex')), sym(b.series), a(wallet), a(lenderKey().publicKey()), i(b.face), i(principal)]);
  const id = result.value as string;
  const spec = await read<Spec>(BOOK, 'get_vault', [a(id)]);
  await update<Index>(indexKey(wallet), old => ({ ...old!, loans: old!.loans.map(l => l.ref === item.ref ? { ...l, id } : l) }));
  const hashes = [result.hash];
  for (const target of [id, spec.delivery]) hashes.push((await invoke(`authorize:${target}`, issuerKey(), RULES, 'set_authorized', [a(BOND), a(target), bool(true)])).hash);
  return { contractId: id, delivery: spec.delivery, hashes };
}
export async function fund(wallet: string, id: string) {
  await verified(wallet);
  const { spec } = await ownLoan(wallet, id), operator = vaultKey(), lender = lenderKey();
  await Promise.all([verifyCode(BOOK, BOOK_HASH), verifyCode(id, VAULT_HASH), verifyCode(spec.delivery, VAULT_HASH)]);
  const config = await read<VaultConfig>(id, 'get_config');
  if (config.state[0] !== 'Pending') return { contractId: id, status: config.state[0] };
  const [delivery, quote, bookConfig, bonds] = await Promise.all([read<VaultConfig>(spec.delivery, 'get_config'), read<Series>(BOOK, 'get_series', [sym(spec.series)]), read<Config>(BOOK, 'get_config'), balance(BOND, id)]);
  if (config.book !== BOOK || delivery.book !== BOOK || config.bond !== BOND || config.usdc !== USD || config.borrower !== wallet || config.lender !== lender.publicKey() || config.delivery !== spec.delivery || delivery.bond !== BOND || delivery.usdc !== USD || delivery.borrower !== wallet || delivery.lender !== lender.publicKey() || delivery.delivery !== null || delivery.recipient !== wallet || delivery.state[0] !== 'Pending' || config.recipient !== wallet || quote.token !== BOND || bookConfig.operator !== operator.publicKey() || bookConfig.issuer !== issuerKey().publicKey() || bookConfig.rules !== RULES || bookConfig.usdc !== USD) throw new ApiError(409, 'Configuración de bóveda inesperada.');
  if (bonds < spec.face) throw new ApiError(409, 'Deposite los bonos antes de fondear.');
  for (const target of [id, spec.delivery]) if (!await read<boolean>(BOND, 'authorized', [a(target)])) throw new ApiError(409, 'Falta autorización de custodia.');
  const now = Number((await rpcServer.getLatestLedger()).closeTime);
  if (BigInt(now) > quote.quote.timestamp + bookConfig.max_price_age) throw new ApiError(409, 'Renueve el precio antes de fondear.');
  const net = spec.principal - spec.principal * 30n / 10000n;
  if (await get(`released:${id}`) && await balance(USD, id) >= net) return { contractId: id, status: 'ready_to_open', escrowId: (await get<{ id: string }>(`escrow:${id}`))?.id };
  const roles = { serviceProvider: operator.publicKey(), receiver: id, approver: lender.publicKey(), platformAddress: operator.publicKey(), releaseSigner: operator.publicKey(), disputeResolver: operator.publicKey() };
  const deployed = await apiCall(`tw-deploy:${id}`, operator, '/deployer/single-release', { signer: operator.publicKey(), engagementId: `b1-${id}`, title: 'Rendaval USDC loan', description: 'USDC to RBOND vault', roles, amount: Number(spec.principal) / 1e7, platformFee: 0, milestones: [{ description: 'RBOND depositado en la bóveda' }], trustline: { address: USDC.issuer, symbol: 'USDC' } });
  const escrow = Array.isArray(deployed.value) ? deployed.value[0] as string : deployed.value as string;
  if (!/^C[A-Z2-7]{55}$/.test(escrow)) throw new ApiError(502, 'No pudimos recuperar el escrow USDC.');
  await update(`escrow:${id}`, old => old ?? { id: escrow, hash: deployed.hash });
  // API read is used to verify roles, never to infer funds or debt.
  const rows = await tw<Array<{ contractId: string; roles: typeof roles; amount: number; platformFee: number; trustline: { address: string; symbol: string } }>>(`/helper/get-escrows-by-role?role=receiver&roleAddress=${id}&validateOnChain=true&page=1&pageSize=50`);
  const row = rows.find(r => r.contractId === escrow);
  if (!row || Object.entries(roles).some(([k, v]) => row.roles[k as keyof typeof roles] !== v) || row.amount !== Number(spec.principal) / 1e7 || row.platformFee !== 0 || row.trustline.address !== USDC.issuer || row.trustline.symbol !== 'USDC') throw new ApiError(409, 'El escrow no coincide con los términos.');
  const hashes = [deployed.hash];
  hashes.push((await apiCall(`tw-fund:${id}`, lender, '/escrow/single-release/fund-escrow', { contractId: escrow, signer: lender.publicKey(), amount: Number(spec.principal) / 1e7 })).hash);
  // A completed release is recovered by the outbox even when escrow balance is now zero.
  const released = await get<{ hash: string }>(`released:${id}`);
  if (!released && await balance(USD, id) < net && await balance(USD, escrow) !== spec.principal) throw new ApiError(409, 'Saldo USDC inesperado; no se abre la deuda.');
  for (const [step, key, body] of [
    ['change-milestone-status', operator, { milestoneIndex: '0', newStatus: 'completed', newEvidence: 'RBOND balance and vault terms verified', serviceProvider: operator.publicKey() }],
    ['approve-milestone', lender, { milestoneIndex: '0', approver: lender.publicKey() }],
    ['release-funds', operator, { releaseSigner: operator.publicKey() }],
  ] as const) hashes.push((await apiCall(`tw-${step}:${id}`, key, `/escrow/single-release/${step}`, { contractId: escrow, ...body })).hash);
  await update(`released:${id}`, old => old ?? { hash: hashes.at(-1) });
  if (await balance(USD, id) < net) throw new ApiError(409, 'La bóveda debe recibir al menos el neto.');
  return { contractId: id, escrowId: escrow, status: 'ready_to_open', hashes };
}
export { terminal };
export const loanView = (id: string) => read<View>(BOOK, 'get_loan', [a(id)]);

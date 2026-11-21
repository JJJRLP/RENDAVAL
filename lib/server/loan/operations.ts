import 'server-only';
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from '../env';
import { a, balance, BOND, BOOK, bool, decimal, i, invoke, issuerKey, once, read, rpcServer, RULES, sym, UNIT } from './chain';
import { dollarAsset, lenderKey, networkPassphrase, server, bondAsset } from './network';
import { index, ownBond, ownLoan, verified } from './records';
import { loanView } from './setup';
import { type Config, type Series, type VaultConfig, terminal } from './types';
export async function topup(wallet: string, id: string) {
  await verified(wallet); await ownLoan(wallet, id);
  const view = await loanView(id);
  if (terminal(view.loan.status[0])) throw new ApiError(409, 'El préstamo ya está cerrado.');
  const amount = view.loan.interest + view.loan.escrow_fee, lender = lenderKey();
  const result = await once(`topup:${id}`, lender, async () => new TransactionBuilder(await server.loadAccount(lender.publicKey()), { fee: '10000', networkPassphrase }).addOperation(Operation.payment({ destination: wallet, asset: dollarAsset(), amount: decimal(amount) })).setTimeout(300).build());
  return { ...result, amount: decimal(amount), simulation: true, label: 'Adelanto de prueba del prestamista: interés y comisión TW, una vez por préstamo' };
}
export async function setPrice(wallet: string, id: string, target: unknown, bondId = '') {
  await verified(wallet);
  const ownedLoan = id ? await ownLoan(wallet, id) : null;
  const bond = bondId ? await ownBond(wallet, bondId) : ownedLoan?.bond;
  if (!bond || (ownedLoan && ownedLoan.bondId !== bond.id)) throw new ApiError(403, 'La serie no corresponde al préstamo.');
  const series = bond.series;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > 1 || Math.round(target * 1e7) !== target * 1e7) throw new ApiError(400, 'Precio entre 0 y 1, hasta siete decimales.');
  const [s, c, ledger] = await Promise.all([read<Series>(BOOK, 'get_series', [sym(series)]), read<Config>(BOOK, 'get_config'), rpcServer.getLatestLedger()]);
  const wanted = BigInt(Math.round(target * 1e7)), nextChangeAt = Number(s.changed_at) + c.price_interval;
  if (wanted !== s.quote.price && Number(ledger.closeTime) < nextChangeAt) return { status: 'waiting', price: Number(s.quote.price) / 1e7, target, nextChangeAt, retryAfter: nextChangeAt - Number(ledger.closeTime) };
  const delta = s.quote.price * BigInt(c.max_step_bps) / 10000n;
  const price = wanted < s.quote.price - delta ? s.quote.price - delta : wanted > s.quote.price + delta ? s.quote.price + delta : wanted;
  const result = await invoke(`price:${series}:${s.quote.timestamp}:${price}:${ledger.sequence}`, issuerKey(), BOOK, 'publish_price', [sym(series), i(price)]);
  const hashes = [result.hash];
  // Only this company's indexed loans of this declaration; never scan the book.
  for (const loan of (await index(wallet)).loans.filter(l => l.bondId === bond.id && l.id)) {
    const id = loan.id!;
    if ((await read<VaultConfig>(id, 'get_config')).state[0] !== 'Active') continue;
    const updated = await loanView(id);
    if (updated.health_bps !== null && updated.health_bps >= BigInt(c.margin_bps) && updated.loan.status[0] === 'Active') hashes.push((await invoke(`margin:${id}:${result.hash}`, vaultKey(), BOOK, 'flag_margin', [a(id)])).hash);
  }
  const fresh = await read<Series>(BOOK, 'get_series', [sym(series)]);
  return { status: price === wanted ? 'complete' : 'waiting', target, price: Number(price) / 1e7, nextChangeAt: Number(fresh.changed_at) + c.price_interval, hashes };
}
export async function markDefault(wallet: string, id: string) {
  await verified(wallet); await ownLoan(wallet, id);
  const view = await loanView(id), c = await read<Config>(BOOK, 'get_config');
  if (terminal(view.loan.status[0])) throw new ApiError(409, 'El préstamo ya está cerrado.');
  const result = view.loan.status[0] === 'Defaulted' ? null : await invoke(`default:${id}`, vaultKey(), BOOK, 'mark_default', [a(id)]);
  const current = await loanView(id);
  return { status: 'Defaulted', hash: result?.hash, cureDeadline: Number(current.loan.defaulted_at + c.cure_period) };
}
export async function liquidate(wallet: string, id: string) {
  await verified(wallet); await ownLoan(wallet, id);
  const view = await loanView(id), c = await read<Config>(BOOK, 'get_config');
  if (view.loan.status[0] === 'Liquidated') return { status: 'Liquidated', reused: true };
  if (view.loan.status[0] !== 'Defaulted') throw new ApiError(409, 'Marque el incumplimiento primero.');
  const deadline = Number(view.loan.defaulted_at + c.cure_period), now = Number((await rpcServer.getLatestLedger()).closeTime);
  if (now < deadline) return { status: 'waiting', cureDeadline: deadline, retryAfter: deadline - now };
  const buyer = lenderKey();
  // Buyer needs both issuer permissions, and a classic trustline before authorization.
  const account = await server.loadAccount(buyer.publicKey());
  if (!account.balances.some(b => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === 'RBOND' && b.asset_issuer === issuerKey().publicKey())) await once('buyer-trustline', buyer, async () => new TransactionBuilder(await server.loadAccount(buyer.publicKey()), { fee: '10000', networkPassphrase }).addOperation(Operation.changeTrust({ asset: bondAsset() })).setTimeout(300).build());
  await invoke(`buyer-holder:${id}`, issuerKey(), RULES, 'set_authorized', [a(BOND), a(buyer.publicKey()), bool(true)]);
  await invoke(`buyer-permit:${id}`, issuerKey(), BOOK, 'set_buyer', [a(buyer.publicKey()), bool(true)]);
  const s = await read<Series>(BOOK, 'get_series', [sym(view.loan.asset)]);
  const price = s.quote.price > view.loan.default_price ? s.quote.price : view.loan.default_price;
  const result = await invoke(`liquidate:${id}`, buyer, BOOK, 'liquidate', [a(id), a(buyer.publicKey()), i(price)]);
  return { ...result, simulation: true, status: 'Liquidated', buyer: buyer.publicKey(), buyerBonds: (await balance(BOND, buyer.publicKey())).toString(), price: decimal(price), scale: UNIT.toString() };
}

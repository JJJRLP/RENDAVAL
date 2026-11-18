import 'server-only';
import { ApiError, vaultKey } from '../env';
import { readAttestation } from '../attestation';
import { assetBalance, readBalances } from '../../stellar/horizon';
import { USDC, VBOND } from '../../stellar/assets';
import { terms, OPEN_LOAN_LIMIT, type LoanState, type LoanView, type Bond } from '../../loan/model';
import { cleanObservedJournals, journalAccount } from './deployment-journal';
import { historyPages, loanHistory } from './history';
import { explorer, lenderKey, server, tw } from './network';
export type Escrow = { contractId: string; signer: string; amount: number; balance: number; description: string; engagementId: string; roles: Record<string, string>; trustline: { address: string; symbol: string }; milestones: { status: string; approved: boolean }[]; createdAt?: { _seconds: number }; flags: { released: boolean; resolved: boolean; disputed: boolean } };
export async function verified(wallet: string) {
  const entry = await readAttestation(wallet);
  if (!entry) throw new ApiError(403, 'Verifique su empresa antes de registrar sus bonos.');
  return { status: 'verified' as const, receiptUrl: entry.receiptUrl };
}
export async function escrowsFor(wallet: string) {
  const all: Escrow[] = [];
  for (let page = 1; ; page++) {
    const batch = await tw<Escrow[]>(`/helper/get-escrows-by-role?role=receiver&roleAddress=${wallet}&validateOnChain=true&page=${page}&pageSize=50`);
    if (!Array.isArray(batch)) throw new ApiError(502, 'No pudimos consultar sus garantías. Reintente.');
    all.push(...batch);
    if (batch.length < 50) break;
  }
  const owned = all.filter(e => (e.engagementId === `vault-loan-${wallet}` || e.engagementId?.startsWith(`vault-loan-${wallet}:`)) && e.roles?.platformAddress === vaultKey().publicKey());
  const vault = vaultKey().publicKey();
  for (const e of owned) {
    if (e.signer !== vault || e.trustline?.address !== VBOND.issuer || e.trustline.symbol !== 'VBOND' || e.roles.approver !== lenderKey().publicKey() || e.roles.receiver !== wallet || ![vault, wallet].includes(e.roles.serviceProvider) || e.roles.releaseSigner !== vault || e.roles.disputeResolver !== vault || !Number.isFinite(e.balance) || !Number.isFinite(e.amount) || e.amount < 100 || e.amount > 1000)
      throw new ApiError(409, 'Su garantía necesita revisión del equipo de Vault antes de continuar.');
  }
  return [...new Map(owned.map(e => [e.contractId, e])).values()].sort((a, b) => (b.createdAt?._seconds ?? Number(b.engagementId.split(':')[1]) ?? 0) - (a.createdAt?._seconds ?? Number(a.engagementId.split(':')[1]) ?? 0));
}
export async function escrowFor(wallet: string, contractId: string) {
  if (!/^C[A-Z2-7]{55}$/.test(contractId)) throw new ApiError(409, 'Seleccione el préstamo que desea continuar.');
  const escrow = (await escrowsFor(wallet)).find(e => e.contractId === contractId);
  if (!escrow) throw new ApiError(403, 'Este préstamo no corresponde a su empresa.');
  // A disputed or resolved escrow is out of the ordinary flow; it must not block the company's other loans.
  if (escrow.flags?.disputed || escrow.flags?.resolved) throw new ApiError(409, 'Este préstamo está en revisión del equipo de Vault y no admite operaciones.');
  return escrow;
}
export async function state(wallet: string): Promise<LoanState> {
  const [verification, balances, escrows, lender, pages, journal] = await Promise.all([verified(wallet), readBalances(wallet), escrowsFor(wallet), server.loadAccount(lenderKey().publicKey()), historyPages(wallet), journalAccount()]);
  const bonds = Number(assetBalance(balances, VBOND)?.balance ?? 0), usdc = Number(assetBalance(balances, USDC)?.balance ?? 0);
  const paid = new Set(escrows.filter(e => lender.data_attr[e.contractId]).map(e => e.contractId));
  const [history] = await Promise.all([loanHistory(wallet, escrows, paid, pages), cleanObservedJournals(wallet, escrows.length, journal)]);
  const views: LoanView[] = escrows.map(escrow => {
    const transactions = history.transactions.get(escrow.contractId)!;
    const payment = transactions.find(tx => tx.label === 'Desembolso');
    const repayment = history.repayments.get(escrow.contractId);
    let bond: Bond | null = null;
    try { const parsed = JSON.parse(escrow.description); if (typeof parsed.issuer === 'string' && typeof parsed.series === 'string') bond = parsed; } catch { /* Historical description is plain text. */ }
    return { bond, locked: escrow.flags.released || escrow.flags.resolved ? 0 : escrow.balance,
      repayment: repayment ? { ...repayment, releaseStatus: escrow.flags.released ? 'released' : 'pending' } : null,
      stage: escrow.flags.released ? 'closed' : escrow.flags.resolved ? 'liquidated' : escrow.flags.disputed ? 'disputed' : repayment ? 'repaid_release_pending' : paid.has(escrow.contractId) ? 'active' : escrow.balance >= escrow.amount ? 'collateral_locked' : 'escrow_created',
      terms: terms(escrow.amount, payment ? Date.parse(payment.at) : Date.now()),
      escrow: { contractId: escrow.contractId, description: escrow.description, url: explorer('contract', escrow.contractId) }, transactions };
  });
  const pending = views.filter(v => v.stage === 'escrow_created' || v.stage === 'collateral_locked');
  if (pending.length > 1) throw new ApiError(409, 'Hay más de una garantía en preparación. Contacte al equipo de Vault.');
  const loans = views.filter(v => !pending.includes(v));
  const empty: LoanView = { bond: null, stage: bonds > 0 ? 'bond_registered' : 'none', terms: terms(bonds), locked: 0, escrow: null, repayment: null, transactions: [] };
  const setup = pending[0] ?? (bonds > 0 ? empty : null);
  const openLoans = loans.filter(v => v.stage !== 'closed' && v.stage !== 'liquidated').length;
  const limitReached = openLoans >= OPEN_LOAN_LIMIT;
  const focal = setup ?? loans[0] ?? empty;
  return { ...focal, wallet, verification, bonds, usdc, locked: views.reduce((sum, v) => sum + v.locked, 0), setup, loans, openLoans, limitReached, canRegister: !setup && !limitReached && bonds === 0 };
}

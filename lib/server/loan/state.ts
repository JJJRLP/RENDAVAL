import 'server-only';
import { ApiError, vaultKey } from '../env';
import { readAttestation } from '../attestation';
import { assetBalance, readBalances } from '../../stellar/horizon';
import { USDC, VBOND } from '../../stellar/assets';
import { terms, type LoanState } from '../../loan/model';
import { cleanJournal } from './deployment-journal';
import { repaymentFor } from './repayment';
import { receipts } from './receipts';
import { explorer, lenderKey, server, tw } from './network';
export type Escrow = { contractId: string; signer: string; amount: number; balance: number; description: string; engagementId: string; roles: Record<string, string>; trustline: { address: string; symbol: string }; milestones: { status: string; approved: boolean }[]; createdAt?: { _seconds: number }; flags: { released: boolean; resolved: boolean; disputed: boolean } };
export async function verified(wallet: string) {
  const entry = await readAttestation(wallet);
  if (!entry) throw new ApiError(403, 'Verifique su empresa antes de registrar sus bonos.');
  return { status: 'verified' as const, receiptUrl: entry.receiptUrl };
}
export async function escrowFor(wallet: string, includeClosed = false) {
  const all = await tw<Escrow[]>(`/helper/get-escrows-by-role?role=receiver&roleAddress=${wallet}&validateOnChain=true`);
  if (!Array.isArray(all)) throw new ApiError(502, 'No pudimos consultar su garantía. Reintente.');
  const owned = all.filter(e => (e.engagementId === `vault-loan-${wallet}` || e.engagementId?.startsWith(`vault-loan-${wallet}:`)) && e.roles?.platformAddress === vaultKey().publicKey());
  const active = owned.filter(e => !e.flags?.released && !e.flags?.resolved);
  if (active.length > 1) throw new ApiError(409, 'Encontramos más de una garantía de prueba. Contacte al equipo de Vault para continuar.');
  const e = active[0] ?? (includeClosed ? owned.filter(e => e.flags?.released).sort((a, b) => (b.createdAt?._seconds ?? 0) - (a.createdAt?._seconds ?? 0))[0] : undefined);
  if (e && (e.signer !== vaultKey().publicKey() || e.trustline?.address !== VBOND.issuer || e.trustline.symbol !== 'VBOND' || e.roles.approver !== lenderKey().publicKey() || e.roles.receiver !== wallet || !Number.isFinite(e.balance) || !Number.isFinite(e.amount) || e.amount < 100 || e.amount > 1000 || e.flags.disputed))
    throw new ApiError(409, 'Su garantía necesita revisión del equipo de Vault antes de continuar.');
  if (e && !e.flags.released && !e.flags.resolved) await cleanJournal(wallet);
  return e ?? null;
}
export async function state(wallet: string): Promise<LoanState> {
  const verification = await verified(wallet);
  const [balances, escrow, lender] = await Promise.all([readBalances(wallet), escrowFor(wallet, true), server.loadAccount(lenderKey().publicKey())]);
  const bonds = Number(assetBalance(balances, VBOND)?.balance ?? 0), usdc = Number(assetBalance(balances, USDC)?.balance ?? 0);
  const paid = escrow ? lender.data_attr[escrow.contractId] : undefined;
  const transactions = await receipts(wallet, escrow?.contractId, !!paid);
  const payment = transactions.find(tx => tx.label === 'Desembolso');
  const repayment = escrow && paid ? await repaymentFor(wallet, escrow.contractId, escrow.amount) : null;
  return { wallet, verification, bonds, usdc, locked: escrow?.balance ?? 0,
    repayment: repayment ? { ...repayment, releaseStatus: escrow?.flags.released ? 'released' : 'pending' } : null,
    stage: escrow?.flags.released ? 'closed' : repayment ? 'repaid_release_pending' : paid ? 'active' : escrow ? escrow.balance >= escrow.amount ? 'collateral_locked' : 'escrow_created' : bonds > 0 ? 'bond_registered' : 'none',
    terms: terms(escrow?.amount ?? bonds, payment ? Date.parse(payment.at) : Date.now()),
    escrow: escrow ? { contractId: escrow.contractId, description: escrow.description, url: explorer('contract', escrow.contractId) } : null, transactions };
}

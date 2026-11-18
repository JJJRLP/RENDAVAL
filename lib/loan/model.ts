import { maxLoan, oneMonthCost } from '../format';
export const BS_PER_USD = 6.96;
export type Bond = { issuer: string; series: string; nominalBs: number; coupon: number; maturity: string };
export const exampleBond: Bond = { issuer: 'Industrias Bruma del Altiplano S.A. (ficticia)', series: 'IAS-2026-A', nominalBs: 2784, coupon: 7.5, maturity: '2028-11-18' };
export type Stage = 'none' | 'bond_registered' | 'escrow_created' | 'collateral_locked' | 'active' | 'repaid_release_pending' | 'closed';
export const usdcAmount = (value: number) => value.toFixed(7);
export const roundUsdc = (value: number) => Number(usdcAmount(value));
export function terms(collateral: number, start = Date.now()) {
  const loan = roundUsdc(maxLoan(collateral)), interest = roundUsdc(oneMonthCost(loan));
  return { collateral, nominalBs: collateral * BS_PER_USD, loan, interest, total: roundUsdc(loan + interest), dueDate: new Date(start + 30 * 86400000).toISOString() };
}
export type LoanView = { bond: Bond | null; stage: Stage; locked: number; terms: ReturnType<typeof terms>; escrow: { contractId: string; description: string; url: string } | null; repayment: { amount: number; at: string; hash: string; url: string; releaseStatus: 'pending' | 'released' } | null; transactions: { hash: string; url: string; at: string; label: string }[] };
export const OPEN_LOAN_LIMIT = 3;
export const LIMIT_MESSAGE = 'Esta versión de prueba admite hasta 3 préstamos abiertos por empresa. Consulte sus préstamos abajo; los bonos pendientes de devolución también cuentan.';
export type LoanState = { setup: LoanView | null; loans: LoanView[]; canRegister: boolean; openLoans: number; limitReached: boolean; wallet: string; verification: { status: 'verified'; receiptUrl: string }; stage: Stage; bonds: number; usdc: number; locked: number; terms: ReturnType<typeof terms>; escrow: { contractId: string; description: string; url: string } | null; repayment: { amount: number; at: string; hash: string; url: string; releaseStatus: 'pending' | 'released' } | null; transactions: { hash: string; url: string; at: string; label: string }[] };

export const exampleBonds: Bond[] = [exampleBond, { issuer: 'Manufacturas Luna de Sal S.A. (ficticia)', series: 'MLS-2026-B', nominalBs: 2088, coupon: 7, maturity: '2029-06-30' }, { issuer: 'Tejidos Nube del Valle S.A. (ficticia)', series: 'TNV-2026-C', nominalBs: 1392, coupon: 8, maturity: '2029-12-15' }];

import { maxLoan, oneMonthCost } from '../format';
export const BS_PER_USD = 6.96;
export type Bond = { issuer: string; series: string; nominalBs: number; coupon: number; maturity: string };
export const exampleBond: Bond = { issuer: 'Industrias Andinas del Sur S.A.', series: 'IAS-2026-A', nominalBs: 6960, coupon: 7.5, maturity: '2028-11-18' };
export type Stage = 'none' | 'bond_registered' | 'escrow_created' | 'collateral_locked' | 'active';
export function terms(collateral: number, start = Date.now()) {
  const loan = maxLoan(collateral), interest = oneMonthCost(loan);
  return { collateral, nominalBs: collateral * BS_PER_USD, loan, interest, total: loan + interest, dueDate: new Date(start + 30 * 86400000).toISOString() };
}
export type LoanState = { wallet: string; verification: { status: 'verified'; receiptUrl: string }; stage: Stage; bonds: number; usdc: number; locked: number; terms: ReturnType<typeof terms>; escrow: { contractId: string; description: string; url: string } | null; transactions: { hash: string; url: string; at: string; label: string }[] };

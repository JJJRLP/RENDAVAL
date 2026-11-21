import type { Bond, LoanState, LoanView } from './model';
export type CompanyBond = { id: string; bond: Bond; face: string; certificateHash: string; status: string; availability: string; priceAge: number | null; transactions: { hash: string; url: string }[] };
export type CompanyLoan = LoanView & { id: string; bondId: string; status: string; readyToOpen: boolean; priceFresh: boolean; priceAge: number; cureDeadline: number | null; deliveryBalance: string; amounts: { principal: string; fee: string; net: string; debt: string }; links: Record<string, string | null>; view: null | { overdue: boolean; loan: { proceeds: string; surplus: string; loss: string } } };
export type CompanyState = LoanState & { bondRecords: CompanyBond[]; allLoans: CompanyLoan[]; preparations: { bondId: string }[]; claimable: string; claimTransactions?: { hash: string; url: string }[] };
export const amount = (raw: string) => Number(raw) / 1e7;

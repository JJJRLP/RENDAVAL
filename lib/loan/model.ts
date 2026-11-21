import { countries, countryFor, currencyFor, type CountryCode } from '../countries';
import { formatNumber, maxLoan } from '../format';
export const BS_PER_USD = countries[0].perUsd;
export type Bond = { issuer: string; series: string; nominal: number; currency: string; coupon: number; maturity: string };
export const exampleBond: Bond = { issuer: 'Industrias Bruma del Altiplano S.A. (ficticia)', series: 'IAS-2026-A', nominal: 2784, currency: 'BOB', coupon: 7.5, maturity: '2028-11-18' };
export type Stage = 'none' | 'bond_registered' | 'escrow_created' | 'collateral_locked' | 'active' | 'closed' | 'disputed' | 'liquidated';
/** TW fee on gross USDC principal. Bonds are returned in full. */
export const CUSTODY_FEE = 0.003;
export const usdcAmount = (value: number) => value.toFixed(7);
export const roundUsdc = (value: number) => Number(usdcAmount(value));
export function terms(collateral: number, start = Date.now()) {
  const loan = roundUsdc(maxLoan(collateral)), interest = Math.ceil(Math.round(loan * 1e7) / 150) / 1e7;
  const custodyFee = Math.floor(loan * 1e7 * 30 / 10000) / 1e7;
  return { collateral, loan, interest, total: roundUsdc(loan + interest), custodyFee, bondsBack: collateral, dueDate: new Date(start + 30 * 86400000).toISOString() };
}
export type LoanView = { price: number; collateralValue: number; health: { ratio: number | null; level: 'ok' | 'warning' | 'risk' | 'unknown' }; bond: Bond | null; stage: Stage; locked: number; terms: ReturnType<typeof terms>; escrow: { contractId: string; description: string; url: string } | null; repayment: { amount: number; at: string; hash: string; url: string; releaseStatus: 'pending' | 'released' } | null; transactions: { hash: string; url: string; at: string; label: string }[] };
export const OPEN_LOAN_LIMIT = 3;
export const LIMIT_MESSAGE = 'Esta versión de prueba admite hasta 3 préstamos abiertos por empresa. Consulte sus préstamos abajo; los bonos pendientes de devolución también cuentan.';
export type LoanState = { setup: LoanView | null; loans: LoanView[]; canRegister: boolean; openLoans: number; limitReached: boolean; wallet: string; verification: { country: CountryCode; status: 'verified'; receiptUrl: string }; stage: Stage; bonds: number; usdc: number; locked: number; terms: ReturnType<typeof terms>; escrow: { contractId: string; description: string; url: string } | null; repayment: { amount: number; at: string; hash: string; url: string; releaseStatus: 'pending' | 'released' } | null; transactions: { hash: string; url: string; at: string; label: string }[] };

export const exampleBonds: Bond[] = [exampleBond, { issuer: 'Manufacturas Luna de Sal S.A. (ficticia)', series: 'MLS-2026-B', nominal: 2088, currency: 'BOB', coupon: 7, maturity: '2029-06-30' }, { issuer: 'Tejidos Nube del Valle S.A. (ficticia)', series: 'TNV-2026-C', nominal: 1392, currency: 'BOB', coupon: 8, maturity: '2029-12-15' }];

/** Example risk thresholds (debt as a share of collateral value). Not an offer. */
export const DEMO_PRICES: readonly number[] = [1, 0.8, 0.65, 0.5];
export const HEALTH_WARNING = 0.7;
export const HEALTH_LIMIT = 0.85;
export function loanHealth(debt: number, collateral: number) {
  const ratio = collateral > 0 ? debt / collateral : 1;
  return { ratio, level: ratio < HEALTH_WARNING ? 'ok' as const : ratio < HEALTH_LIMIT ? 'warning' as const : 'risk' as const };
}

/** Parse declaration metadata. Server applies admission limits. */
export function normalizeBond(input: unknown): Bond | null {
  if (!input || typeof input !== 'object') return null;
  const b = input as Record<string, unknown>;
  const nominal = b.nominal;
  const currency = b.currency;
  if (typeof b.issuer !== 'string' || typeof b.series !== 'string' || typeof nominal !== 'number' || !Number.isFinite(nominal) || nominal <= 0 || !currencyFor(currency) || typeof b.coupon !== 'number' || !Number.isFinite(b.coupon) || typeof b.maturity !== 'string') return null;
  return { issuer: b.issuer, series: b.series, nominal, currency: currency as string, coupon: b.coupon, maturity: b.maturity };
}
export const bondUsd = (bond: Bond) => bond.nominal / currencyFor(bond.currency)!.perUsd;
export function bondValue(bond: Bond | null, collateral: number, fallbackCurrency = 'BOB') {
  const currency = currencyFor(bond?.currency ?? fallbackCurrency)!;
  const nominal = bond && Math.abs(bondUsd(bond) - collateral) < 0.000001 ? bond.nominal : collateral * currency.perUsd;
  return `${currency.symbol} ${formatNumber(nominal, 2)} ${currency.currency} · USD ${formatNumber(collateral, 2)}${currency.currency === 'USD' ? '' : ' (referencia de demostración)'}`;
}
const exampleIssuers: Record<CountryCode, string[]> = {
  BO: exampleBonds.map(b => b.issuer),
  AR: ['Tejidos Bruma del Plata', 'Industrias Luna Pampeana', 'Manufacturas Nube Austral'],
  BR: ['Indústrias Bruma Tropical', 'Tecidos Lua do Cerrado', 'Manufaturas Nuvem Azul'],
  CL: ['Industrias Bruma del Pacífico', 'Tejidos Luna del Desierto', 'Manufacturas Nube Austral'],
  CO: ['Tejidos Bruma del Caribe', 'Industrias Luna Cafetera', 'Manufacturas Nube del Valle'],
  MX: ['Industrias Bruma del Bajío', 'Tejidos Luna del Norte', 'Manufacturas Nube del Golfo'],
  PE: ['Tejidos Bruma del Pacífico', 'Industrias Luna de la Sierra', 'Manufacturas Nube del Valle'],
  OTHER: ['Industrias Bruma Global', 'Tejidos Luna Global', 'Manufacturas Nube Global'],
};
export function examplesFor(country: CountryCode): Bond[] {
  const c = countryFor(country)!;
  return exampleBonds.map((b, i) => ({ ...b, issuer: country === 'BO' ? b.issuer : `${exampleIssuers[country][i]} (ficticia)`, currency: c.currency, nominal: (400 - i * 100) * c.perUsd }));
}

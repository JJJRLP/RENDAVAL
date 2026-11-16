/**
 * Formats a number the Spanish way: "." for thousands, "," for decimals.
 * Hand-rolled so server and browser always produce the same string.
 */
export function formatNumber(value: number, decimals = 0): string {
  const [integer, fraction] = value.toFixed(decimals).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}

/** Example terms used across the page. Not an offer. */
export const EXAMPLE_LTV = 0.5;
export const EXAMPLE_ANNUAL_RATE = 0.08;

export function maxLoan(collateralUsd: number): number {
  return collateralUsd * EXAMPLE_LTV;
}

export function oneMonthCost(loanUsdc: number): number {
  return (loanUsdc * EXAMPLE_ANNUAL_RATE) / 12;
}

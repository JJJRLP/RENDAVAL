export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const USDC = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
};
export const RBOND = {
  code: "RBOND",
  issuer: process.env.NEXT_PUBLIC_VBOND_ISSUER ?? "",
};
export const TRUST_ASSETS = [USDC, RBOND];
export type CreditAsset = { code: string; issuer: string };
export const isClassicAddress = (address: string) => /^G[A-Z2-7]{55}$/.test(address);

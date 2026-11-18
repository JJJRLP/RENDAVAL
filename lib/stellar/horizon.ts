import { HORIZON_URL, isClassicAddress, type CreditAsset } from "./assets";

export type Balance = {
  asset_type: string;
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
};

function isBalance(value: unknown): value is Balance {
  if (!value || typeof value !== "object") return false;
  return "asset_type" in value && typeof value.asset_type === "string" &&
    "balance" in value && typeof value.balance === "string" && /^\d+(\.\d+)?$/.test(value.balance) &&
    (value.asset_type === "native" ||
      ("asset_code" in value && typeof value.asset_code === "string" &&
       "asset_issuer" in value && typeof value.asset_issuer === "string"));
}

export async function readBalances(address: string, signal?: AbortSignal): Promise<Balance[]> {
  if (!isClassicAddress(address)) {
    throw new Error("Su cuenta no es compatible con esta versión. Ingrese con correo o Google.");
  }
  const response = await fetch(`${HORIZON_URL}/accounts/${address}`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (response.status === 404) throw new Error("Su cuenta se está activando. Pulse Reintentar en unos segundos.");
  if (!response.ok) throw new Error("No pudimos consultar sus saldos. Intente nuevamente.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("balances" in data) ||
      !Array.isArray(data.balances) || !data.balances.every(isBalance)) {
    throw new Error("No pudimos consultar sus saldos. Intente nuevamente.");
  }
  return data.balances;
}

export function assetBalance(balances: Balance[], asset: CreditAsset): Balance | undefined {
  return balances.find((balance) => balance.asset_code === asset.code && balance.asset_issuer === asset.issuer);
}

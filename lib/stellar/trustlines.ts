import type { TrustlineOutcome } from "@pollar/core";
import { type CreditAsset } from "./assets";

// Share in-flight requests across effect remounts. Pending approvals must not be
// submitted again: retry checks Horizon until they have settled.
const inFlight = new Map<string, Promise<TrustlineOutcome>>();
const pending = new Set<string>();
const keyFor = (address: string, asset: CreditAsset) => `${address}:${asset.code}:${asset.issuer}`;

export function confirmedTrustline(address: string, asset: CreditAsset) {
  pending.delete(keyFor(address, asset));
}

export async function createTrustline(
  address: string,
  asset: CreditAsset,
  submit: (asset: CreditAsset) => Promise<TrustlineOutcome>,
) {
  const key = keyFor(address, asset);
  if (pending.has(key)) return;
  let request = inFlight.get(key);
  if (!request) {
    request = submit(asset);
    inFlight.set(key, request);
  }
  try {
    const result = await request;
    if (result.status === "error") {
      throw new Error(`No pudimos habilitar ${asset.code === 'USDC' ? 'los dólares digitales' : 'los bonos'} en su cuenta. Intente nuevamente.`);
    }
    pending.add(key);
  } finally {
    inFlight.delete(key);
  }
}

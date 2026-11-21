// Unsigned API capability checks against an existing, already closed escrow.
// This script never signs, submits, or moves funds.
import { readFileSync, writeFileSync } from 'node:fs';
const old = JSON.parse(readFileSync(new URL('../../evidence/archive/c2/loan-book-testnet.json', import.meta.url)));
const contractId = 'CDALLEYS4JWSXA7CC2SASY2TZ5AWSNRMCPDU55A5NELEWLM4FOKT3253';
const out = { checkedAt: new Date().toISOString(), network: 'TESTNET', submitted: false, contractId, probes: [] };
for (const [route, params] of [
  ['release-funds', { releaseSigner: old.contractId }],
  ['resolve-dispute', { disputeResolver: old.contractId, distributions: [{ address: old.lender, amount: 1 }] }],
]) {
  const response = await fetch(`https://dev.api.trustlesswork.com/escrow/single-release/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TRUSTLESS_WORK_API_KEY }, body: JSON.stringify({ contractId, ...params }), signal: AbortSignal.timeout(45000) });
  const body = await response.json();
  const result = { route, status: response.status, body };
  out.probes.push(result); console.log(JSON.stringify(result));
  writeFileSync(new URL('./api-signers.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
}

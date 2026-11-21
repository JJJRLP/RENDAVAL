// Builds unsigned testnet transactions only. Never signs or submits.
import { readFileSync, writeFileSync } from 'node:fs';
const old = JSON.parse(readFileSync(new URL('../../evidence/loan-book-testnet.json', import.meta.url)));
const roles = { approver: old.lender, serviceProvider: old.operator, platformAddress: old.operator, releaseSigner: old.operator, disputeResolver: old.operator, receiver: old.operator };
const out = { network: 'TESTNET', checkedAt: new Date().toISOString(), submitted: false, probes: [] };
for (const role of ['receiver', 'releaseSigner', 'disputeResolver', 'platformAddress']) {
  const response = await fetch('https://dev.api.trustlesswork.com/deployer/single-release', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TRUSTLESS_WORK_API_KEY },
    body: JSON.stringify({ signer: old.operator, engagementId: `c3-unsigned-probe-${role}`, title: 'C3 unsigned capability probe', description: 'Never submitted', roles: { ...roles, [role]: old.contractId }, amount: 1, platformFee: 0, milestones: [{ description: 'Collateral locked' }], trustline: { address: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', symbol: 'USDC' } }), signal: AbortSignal.timeout(45000)
  });
  const data = await response.json();
  const result = { role, address: old.contractId, status: response.status, built: typeof data.unsignedTransaction === 'string', message: data.message ?? data.error ?? null };
  out.probes.push(result);
  console.log(JSON.stringify(result));
  writeFileSync(new URL('./api-capabilities.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
}

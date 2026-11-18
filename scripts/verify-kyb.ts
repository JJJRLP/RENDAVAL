// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-kyb.ts
import { Keypair } from '@stellar/stellar-sdk';
import { createSession, decision, simulate } from '../lib/server/didit';
import { status } from '../lib/server/kyb';
import { readAttestation } from '../lib/server/attestation';
async function main() {
  const wallet = Keypair.random().publicKey();
  const created = await createSession(wallet, 'http://localhost:3017');
  console.log(JSON.stringify({ company: wallet, sessionId: created.sessionId }));
  console.log('before:', (await decision(wallet, created.sessionId)).status);
  await simulate(wallet, created.sessionId);
  console.log('check:', await status(wallet, created.sessionId, true));
  const entry = await readAttestation(wallet);
  console.log('read-back:', entry);
  if (entry?.sessionId !== created.sessionId) throw new Error('Read-back mismatch');
  const current = await status(wallet);
  console.log('status:', current);
  if (current.status !== 'verified') throw new Error('Status mismatch');
  const repeated = await status(wallet, created.sessionId, true);
  console.log('idempotent check:', repeated);
  if ('txHash' in repeated) throw new Error('Duplicate transaction');
  try { await decision(Keypair.random().publicKey(), created.sessionId); throw new Error('Ownership check failed'); }
  catch (error) { if ((error as {status?: number}).status !== 403) throw error; console.log('Wrong company: 403'); }
}
main().catch(() => { console.error('KYB smoke failed; inspect service configuration and connectivity.'); process.exitCode = 1; });

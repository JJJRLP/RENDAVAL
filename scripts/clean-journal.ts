// Run with deployments idle; never removes non-deployment entries.
import { Keypair } from '@stellar/stellar-sdk';
import { required } from '../lib/server/env';
import { server } from '../lib/server/loan/network';
import { cleanJournal } from '../lib/server/loan/deployment-journal';
async function main() {
  const issuer = Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY')).publicKey();
  console.log('issuer subentries before', (await server.loadAccount(issuer)).subentry_count);
  await cleanJournal();
  console.log('issuer subentries after', (await server.loadAccount(issuer)).subentry_count);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Cleanup failed'); process.exitCode = 1; });

// Read-only: no signing keys, transaction submission, or API credentials.
import { readFileSync, writeFileSync } from 'node:fs';
import { contract, Contract, Networks, rpc, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';
const old = JSON.parse(readFileSync(new URL('../../evidence/archive/c2/loan-book-testnet.json', import.meta.url)));
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const out = { network: 'TESTNET', checkedAt: new Date().toISOString(), submitted: false, reads: [] };
for (const [id, methods] of [
  [old.rulesContractId, ['get_config', 'live_pledges']],
  ['CDALLEYS4JWSXA7CC2SASY2TZ5AWSNRMCPDU55A5NELEWLM4FOKT3253', ['get_escrow']],
  ['CAD22WTYGHVCBUUHVNPWZCKD4I7VNK4Z6ZFWBXNQIQNVZJHZLERP6C6T', ['get_escrow']],
]) {
  const client = await contract.Client.from({ contractId: id, rpcUrl: server.serverURL.toString(), networkPassphrase: Networks.TESTNET, publicKey: old.operator });
  for (const method of methods) {
    const tx = new TransactionBuilder(await server.getAccount(old.operator), { fee: '1000000', networkPassphrase: Networks.TESTNET }).addOperation(new Contract(id).call(method, ...client.spec.funcArgsToScVals(method, {}))).setTimeout(60).build();
    const sim = await server.simulateTransaction(tx);
    if (!sim.result) throw new Error(`Read failed: ${id} ${method}`);
    out.reads.push({ id, method, ledger: sim.latestLedger, state: scValToNative(sim.result.retval) });
  }
}
writeFileSync(new URL('./on-chain-state.json', import.meta.url), JSON.stringify(out, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2) + '\n');
console.log('Saved public read-only state evidence.');

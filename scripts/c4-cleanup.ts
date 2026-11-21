// Deletes only the previous server's b1: test records. KYB and other data are preserved.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
const server = new Horizon.Server('https://horizon-testnet.stellar.org');
const file = 'scripts/evidence/c4-classic-cleanup.json';
type Row = { account: string; removed: string[]; preservedHash: string; beforeEntries: number; hashes: string[]; afterEntries?: number; subentries?: number; dataSlotsRemaining?: number; subentrySlotsRemaining?: number };
const evidence: Row[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const hash = (data: Record<string, string>) => createHash('sha256').update(JSON.stringify(Object.entries(data).sort())).digest('hex');
const save = () => writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
async function main() {
  for (const name of ['VAULT_SECRET_KEY', 'BOND_ISSUER_SECRET_KEY']) {
    const key = Keypair.fromSecret(process.env[name]!);
    let account = await server.loadAccount(key.publicKey());
    const preserved = Object.fromEntries(Object.entries(account.data_attr).filter(([k]) => !k.startsWith('b1:')));
    let row = evidence.find(r => r.account === key.publicKey());
    if (!row) { row = { account: key.publicKey(), removed: Object.keys(account.data_attr).filter(k => k.startsWith('b1:')).sort(), preservedHash: hash(preserved), beforeEntries: Object.keys(account.data_attr).length, hashes: [] }; evidence.push(row); save(); }
    assert.equal(hash(preserved), row.preservedHash, 'Non-B1 data changed; inspect before cleanup');
    for (;;) {
      account = await server.loadAccount(key.publicKey());
      const names = Object.keys(account.data_attr).filter(k => k.startsWith('b1:')).slice(0, 100);
      if (!names.length) break;
      const builder = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET });
      for (const name of names) builder.addOperation(Operation.manageData({ name, value: null }));
      const tx = builder.setTimeout(120).build(); tx.sign(key);
      const txHash = Buffer.from(tx.hash()).toString('hex'); row.hashes.push(txHash); save();
      try { await server.submitTransaction(tx); }
      catch { const result = await server.transactions().transaction(txHash).call(); assert(result.successful, 'Unconfirmed cleanup; inspect hash'); }
      console.log('Removed', names.length, 'entries:', txHash);
    }
    assert.equal(hash(account.data_attr), row.preservedHash);
    row.afterEntries = Object.keys(account.data_attr).length;
    row.subentries = account.subentry_count;
    row.dataSlotsRemaining = 1000 - row.afterEntries;
    row.subentrySlotsRemaining = 1000 - row.subentries;
    save(); console.log(key.publicKey(), row.removed.length, 'removed;', row.subentrySlotsRemaining, 'subentry slots remain');
  }
}
main().catch(() => { console.error('Cleanup stopped; inspect recorded hashes and account state before retrying.'); process.exitCode = 1; });

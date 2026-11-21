import 'server-only';
import { createHash } from 'node:crypto';
import { Keypair, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, required } from '../env';
import { badSequence, networkPassphrase, server } from './network';
// A durable deployment outbox on Stellar, not process memory. Parallel Vercel
// invocations replay the SAME signed deployment; they cannot create two escrows.
// Only the public, Vault-signed transaction is stored (never a secret key).
const prefix = (wallet: string) => `deploy:${createHash('sha256').update(wallet).digest('hex').slice(0, 32)}:`;
export async function deploymentJournal(wallet: string, prepare: () => Promise<string>) {
  const signer = Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY'));
  for (let attempt = 0; attempt < 4; attempt++) {
    const account = await server.loadAccount(signer.publicKey()), key = prefix(wallet);
    const count = Number(Buffer.from(account.data_attr[key + 'count'] ?? '', 'base64').toString());
    if (count > 0 && count < 95) {
      const chunks = Array.from({ length: count }, (_, i) => Buffer.from(account.data_attr[key + i] ?? '', 'base64'));
      const saved = Buffer.concat(chunks).toString();
      const deployment = TransactionBuilder.fromXDR(saved, networkPassphrase);
      if (!(deployment instanceof Transaction)) throw new ApiError(502, 'No pudimos recuperar su garantía. Contacte al equipo de Rendaval.');
      const source = await server.loadAccount(deployment.source);
      const ledger = await server.ledgers().order('desc').limit(1).call();
      const receipt = await fetch(`https://horizon-testnet.stellar.org/transactions/${Buffer.from(deployment.hash()).toString('hex')}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (receipt.ok) {
        const result = await receipt.json() as { successful: boolean };
        if (result.successful) throw new ApiError(409, 'Su garantía ya fue creada. Estamos esperando su confirmación; vuelva a continuar en unos segundos.');
      } else {
        if (receipt.status !== 404) throw new ApiError(502, 'No pudimos confirmar su garantía. Vuelva a consultar.');
        const expired = Number(deployment.timeBounds?.maxTime) > 0 && Date.parse(ledger.records[0].closed_at) / 1000 > Number(deployment.timeBounds?.maxTime);
        // Only replace an outbox item once Horizon proves it can NEVER commit.
        if (!expired && BigInt(source.sequenceNumber()) < BigInt(deployment.sequence)) return saved;
      }
    }
    const signed = await prepare(), bytes = Buffer.from(signed), chunks = Math.ceil(bytes.length / 64);
    if (chunks > 94) throw new ApiError(502, 'No pudimos preparar su garantía. Contacte al equipo de Rendaval.');
    const builder = new TransactionBuilder(account, { fee: '10000', networkPassphrase });
    for (let i = 0; i < chunks; i++) builder.addOperation(Operation.manageData({ name: key + i, value: bytes.subarray(i * 64, (i + 1) * 64) }));
    const tx = builder.addOperation(Operation.manageData({ name: key + 'count', value: String(chunks) })).setTimeout(60).build(); tx.sign(signer);
    try { await server.submitTransaction(tx); return signed; }
    catch (error) { if (!badSequence(error)) throw new ApiError(502, 'Estamos guardando su garantía. Vuelva a continuar en unos segundos.'); }
  }
  throw new ApiError(409, 'Hay otra operación en curso. Vuelva a continuar en unos segundos.');
}

export async function deploymentHash(wallet: string) {
  const account = await server.loadAccount(Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY')).publicKey()), key = prefix(wallet);
  const count = Number(Buffer.from(account.data_attr[key + 'count'] ?? '', 'base64').toString());
  if (!count) return null;
  const signed = Buffer.concat(Array.from({ length: count }, (_, i) => Buffer.from(account.data_attr[key + i], 'base64'))).toString();
  return Buffer.from(TransactionBuilder.fromXDR(signed, networkPassphrase).hash()).toString('hex');
}

// Delete only confirmed deployments during normal requests. Administrative cleanup
// must run while deployments are idle; it removes abandoned historical journals.
export async function cleanJournal(wallet?: string) {
  const signer = Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY'));
  for (let attempt = 0; attempt < 12; attempt++) {
    const account = await server.loadAccount(signer.publicKey());
    const names = Object.keys(account.data_attr).filter(name => name.startsWith(wallet ? prefix(wallet) : 'deploy:')).slice(0, 100);
    if (!names.length) return;
    const builder = new TransactionBuilder(account, { fee: '10000', networkPassphrase });
    for (const name of names) builder.addOperation(Operation.manageData({ name, value: null }));
    const tx = builder.setTimeout(60).build(); tx.sign(signer);
    try { await server.submitTransaction(tx); }
    catch (error) { if (!badSequence(error)) throw new ApiError(502, 'Estamos confirmando su garantía. Vuelva a consultar.'); }
  }
  throw new ApiError(409, 'La limpieza sigue pendiente. Vuelva a intentar.');
}

/** Recover cleanup after a lost deployment response, including on reload. Only
 * generations with an indexed contract are eligible; the next outbox is untouched. */
export const journalAccount = () => server.loadAccount(Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY')).publicKey());
export async function cleanObservedJournals(wallet: string, contracts: number, snapshot?: Awaited<ReturnType<typeof journalAccount>>) {
  if (!contracts) return;
  const account = snapshot ?? await journalAccount();
  for (let generation = 0; generation < contracts; generation++) {
    const key = `${wallet}:${generation}`;
    if (account.data_attr[prefix(key) + 'count']) await cleanJournal(key);
  }
}

import 'server-only';
import { Address, Contract, FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, authorizeEntry, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { ApiError, required, vaultKey } from '../env';
import { lenderKey, server, tw } from './network';
import { observed } from './audit';
import { get, update } from './store';
export const BOOK = 'CAC2Y7NO6NVBOSLAKHUQKIIZ5RIIAYXUGRKRB64JPYPPSM2KZQPBPKJA';
export const RULES = 'CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC';
export const BOND = 'CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3';
export const USD = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const ISSUER = 'GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6';
export const UNIT = 10000000n;
export const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
export const a = (s: string) => new Address(s).toScVal();
export const i = (n: bigint | string) => nativeToScVal(BigInt(n), { type: 'i128' });
export const sym = (s: string) => nativeToScVal(s, { type: 'symbol' });
export const bytes = (b: Uint8Array) => nativeToScVal(Buffer.from(b));
export const bool = (b: boolean) => nativeToScVal(b);
export const decimal = (n: bigint) => `${n / UNIT}.${(n % UNIT).toString().padStart(7, '0')}`;
export function units(amount: string) {
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) throw new ApiError(502, 'Importe decimal inválido.');
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, '0'));
}
export const issuerKey = () => {
  const key = Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY'));
  if (key.publicKey() !== ISSUER || required('NEXT_PUBLIC_VBOND_ISSUER') !== ISSUER) throw new ApiError(503, 'Configure el emisor RBOND de testnet.');
  return key;
};
export const inner = (tx: Transaction | FeeBumpTransaction) => tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
export async function raw(source: string, contract: string, method: string, args: xdr.ScVal[] = []) {
  return new TransactionBuilder(await rpcServer.getAccount(source), { fee: '10000', networkPassphrase: Networks.TESTNET }).addOperation(new Contract(contract).call(method, ...args)).setTimeout(300).build();
}
export async function read<T>(contract: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const sim = await rpcServer.simulateTransaction(await raw(vaultKey().publicKey(), contract, method, args));
  if (!rpc.Api.isSimulationSuccess(sim)) throw new ApiError(409, `Lectura ${method} no disponible; revise estado o TTL del contrato. ${rpc.Api.isSimulationError(sim) ? sim.error : ''}`);
  return scValToNative(sim.result!.retval) as T;
}
export const balance = (token: string, who: string) => read<bigint>(token, 'balance', [a(who)]);
export async function prepare(source: string, contract: string, method: string, args: xdr.ScVal[] = []) {
  const tx = await raw(source, contract, method, args), sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new ApiError(409, `El contrato no permite ${method} en este estado. ${rpc.Api.isSimulationError(sim) ? sim.error : ''}`);
  for (let n = 0; n < (sim.result?.auth.length ?? 0); n++) {
    const auth = sim.result!.auth[n];
    if (auth.credentials.type === 'sorobanCredentialsSourceAccount') continue;
    if (auth.credentials.type === 'sorobanCredentialsAddressWithDelegates') throw new ApiError(409, 'Credenciales no admitidas.');
    const who = Address.fromScAddress(auth.credentials.value.address).toString();
    const key = [vaultKey(), lenderKey(), issuerKey()].find(k => k.publicKey() === who);
    if (!key) throw new ApiError(409, 'Se requiere una autorización no disponible.');
    sim.result!.auth[n] = await authorizeEntry(auth, key, sim.latestLedger + 60, Networks.TESTNET);
  }
  return rpc.assembleTransaction(tx, sim).build();
}
type Receipt = { hash: string; value: unknown };
type Journal = { xdr?: string; api: boolean; prediction?: unknown; receipt?: Receipt };
export async function receipt(hash: string): Promise<Receipt | null> {
  const r = await rpcServer.getTransaction(hash);
  if (r.status === 'SUCCESS') return { hash, value: r.returnValue ? scValToNative(r.returnValue) : null };
  if (r.status === 'FAILED') throw new ApiError(409, `Transacción fallida: ${hash}`);
  // Horizon retains transaction metadata beyond RPC retention. Never infer success from a timeout.
  try {
    const h = await server.transactions().transaction(hash).call();
    if (!h.successful) throw new ApiError(409, `Transacción fallida: ${hash}`);
    if (!h.result_meta_xdr) return { hash, value: null };
    const meta = xdr.TransactionMeta.fromXDR(h.result_meta_xdr, 'base64');
    const value = meta.type === 'v4' ? meta.value.sorobanMeta?.returnValue : meta.type === 'v3' ? meta.value.sorobanMeta?.returnValue : null;
    return { hash, value: value ? scValToNative(value) : null };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as { response?: { status: number } }).response?.status !== 404) throw e;
    return null;
  }
}
async function remember(label: string, result: Receipt) {
  const target = label.match(/C[A-Z2-7]{55}/)?.[0] ?? (label.startsWith('price:') ? label.split(':')[1] : label.match(/[a-f0-9]{64}/)?.[0]);
  if (target) await update<{ label: string; hash: string }[]>(`activity:${target}`, old => {
    const rows = old ?? [];
    if (!rows.some(row => row.hash === result.hash)) rows.push({ label, hash: result.hash });
    return rows;
  });
  observed(label, result.hash);
  return result;
}
/** Durable outbox, persisted BEFORE submission. All retry callers use the winning envelope. */
export async function once(label: string, source: Keypair | string, build: () => Promise<Transaction | FeeBumpTransaction>, api = false): Promise<Receipt> {
  const address = typeof source === 'string' ? source : source.publicKey();
  const journalKey = `outbox:${BOOK}:${label}`, keeper = address === vaultKey().publicKey() ? issuerKey() : vaultKey();
  let record = await get<Journal>(journalKey, keeper);
  if (record?.receipt) return remember(label, record.receipt);
  record = await update<Journal>(journalKey, async old => {
    if (old?.xdr || old?.receipt) return old;
    const tx = await build();
    let prediction: unknown = null;
    if (inner(tx).operations[0]?.type === 'invokeHostFunction') {
      const sim = await rpcServer.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim)) throw new ApiError(409, 'La operación cambió antes de guardarse.');
      prediction = scValToNative(sim.result!.retval);
    }
    if (typeof source !== 'string') tx.sign(source);
    return { xdr: tx.toXDR(), api, prediction };
  }, keeper);
  if (record.receipt) return remember(label, record.receipt);
  const tx = TransactionBuilder.fromXDR(record.xdr!, Networks.TESTNET), hash = Buffer.from(tx.hash()).toString('hex');
  let found: Receipt | null;
  try { found = await receipt(hash); }
  catch (e) {
    if (!(e instanceof ApiError) || !e.message.startsWith('Transacción fallida:')) throw e;
    await update<Journal>(journalKey, old => old?.xdr === record.xdr ? { api } : old!, keeper);
    throw e;
  }
  if (!record.xdr) throw new ApiError(409, 'Reintente la operación fallida.');
  if (!found) {
    // Same bytes may safely be broadcast again. No fresh payment on an uncertain result.
    try {
      if (api) await tw('/helper/send-transaction', { signedXdr: record.xdr });
      else await rpcServer.sendTransaction(tx);
    } catch { /* Resolve by hash, even after a provider timeout. */ }
    for (let n = 0; n < 18 && !found; n++) {
      await new Promise(r => setTimeout(r, 1500));
      found = await receipt(hash);
    }
  }
  if (!found) {
    const ledgers = await server.ledgers().order('desc').limit(1).call();
    if (Date.parse(ledgers.records[0].closed_at) / 1000 > Number(inner(tx).timeBounds?.maxTime ?? Infinity)) {
      // Horizon has ingested beyond expiry and hash is absent: this envelope cannot commit.
      await update<Journal>(journalKey, old => old?.xdr === record.xdr ? { api } : old!, keeper);
      throw new ApiError(409, 'La transacción venció sin confirmación. Reintente.');
    }
    throw new ApiError(202, `Confirmación pendiente: ${hash}`);
  }
  if (found.value === null && record.prediction !== undefined) found.value = record.prediction;
  await update<Journal>(journalKey, () => ({ api, receipt: found! }), keeper);
  return remember(label, found);
}
export const invoke = (label: string, key: Keypair, id: string, method: string, args: xdr.ScVal[] = []) => once(label, key, () => prepare(key.publicKey(), id, method, args));
export async function apiCall(label: string, key: Keypair, path: string, body: unknown) {
  return once(label, key, async () => {
    const result = await tw<{ unsignedTransaction: string }>(path, body);
    const tx = TransactionBuilder.fromXDR(result.unsignedTransaction, Networks.TESTNET);
    if (!(tx instanceof Transaction) || tx.source !== key.publicKey()) throw new ApiError(502, 'Origen inesperado de Trustless Work.');
    return tx;
  }, true);
}
export async function validateSigned(signed: unknown, wallet: string, expected: Transaction) {
  try {
    if (typeof signed !== 'string' || signed.length > 100000) throw Error();
    const envelope = TransactionBuilder.fromXDR(signed, Networks.TESTNET), tx = inner(envelope);
    if (envelope instanceof FeeBumpTransaction && envelope.feeSource === wallet && BigInt(envelope.fee) > BigInt(expected.fee) + 100000n) throw Error();
    // Exact inner transaction binds source, sequence, network, memo, fees, contract,
    // method, ALL args, Soroban resource data, auth identities and full nested trees.
    if (!Buffer.from(tx.hash()).equals(expected.hash()) || tx.source !== wallet || tx.operations.length !== 1 ||
      !tx.signatures.some(s => Keypair.fromPublicKey(wallet).verify(tx.hash(), s.signature))) throw Error();
    return envelope;
  } catch { throw new ApiError(400, 'La firma no corresponde exactamente a la operación preparada para su empresa.'); }
}
export async function verifyCode(id: string, expectedHash: string) {
  const entry = (await rpcServer.getLedgerEntries(new Contract(id).getFootprint())).entries[0];
  if (!entry || entry.val.type !== 'contractData' || entry.val.contractData.val.type !== 'scvContractInstance') throw new ApiError(409, 'Contrato archivado o no disponible; restaure su TTL.');
  const executable = entry.val.contractData.val.instance.executable;
  if (executable.type !== 'contractExecutableWasm' || Buffer.from(executable.wasmHash.value).toString('hex') !== expectedHash) throw new ApiError(409, 'Código de contrato inesperado.');
}
export const VAULT_HASH = 'd3d13acaaa58c0e1f3e8becf7ef2238ed87fd481cb0020c20e54164915f61395';
export const BOOK_HASH = '1d7df137f8076dd584eb193231ecb7c219ca58e741f2b68a6e0bc56799210626';

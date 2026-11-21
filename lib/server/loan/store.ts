import 'server-only';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from '../env';
import { observed } from './audit';
import { server, networkPassphrase, badSequence } from './network';
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
type Data = Record<string, string>;
const prefix = (key: string) => `b1:${digest(key).slice(0, 40)}:`;
export function decode<T>(data: Data, key: string): T | null {
  const p = prefix(key), count = Number(Buffer.from(data[p + 'n'] ?? '', 'base64').toString());
  if (!count) return null;
  if (count > 98) throw new ApiError(502, 'Registro de cadena inválido.');
  return JSON.parse(inflateSync(Buffer.concat(Array.from({ length: count }, (_, n) => {
    if (!data[p + n]) throw new ApiError(502, 'Registro de cadena incompleto.');
    return Buffer.from(data[p + n], 'base64');
  }))).toString()) as T;
}
export async function get<T>(key: string, signer = vaultKey()): Promise<T | null> {
  // Direct key reads: do not download or enumerate the application's portfolio.
  const p = prefix(key);
  async function entry(name: string) {
    const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${signer.publicKey()}/data/${name}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new ApiError(502, 'No pudimos leer el índice Stellar.');
    return (await r.json() as { value: string }).value;
  }
  const n = await entry(p + 'n');
  if (!n) return null;
  const count = Number(Buffer.from(n, 'base64').toString());
  if (!Number.isInteger(count) || count < 1 || count > 98) throw new ApiError(502, 'Índice inválido.');
  const values = await Promise.all(Array.from({ length: count }, (_, i) => entry(p + i)));
  return decode<T>(Object.fromEntries([[p + 'n', n], ...values.map((v, i) => [p + i, v ?? ''])]), key);
}
/** Atomic compare/update using the journal account sequence, including all chunks. */
export async function update<T>(key: string, fn: (old: T | null) => Promise<T> | T, signer = vaultKey()) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const account = await server.loadAccount(signer.publicKey());
    const old = decode<T>(account.data_attr, key), before = json(old), value = await fn(old);
    if (before === json(value)) return value;
    const bytes = deflateSync(Buffer.from(json(value))), count = Math.ceil(bytes.length / 64), p = prefix(key);
    if (count > 98) throw new ApiError(409, 'Registro demasiado grande para una escritura atómica.');
    const builder = new TransactionBuilder(account, { fee: '1000', networkPassphrase });
    for (let i = 0; i < count; i++) builder.addOperation(Operation.manageData({ name: p + i, value: bytes.subarray(i * 64, (i + 1) * 64) }));
    // Stale trailing chunks are ignored; the count and new contents commit together.
    builder.addOperation(Operation.manageData({ name: p + 'n', value: String(count) }));
    const tx = builder.setTimeout(60).build(); tx.sign(signer);
    observed(`journal:${key}`, Buffer.from(tx.hash()).toString('hex'));
    try { await server.submitTransaction(tx); return value; }
    catch (error) {
      const saved = await get<T>(key, signer);
      if (json(saved) === json(value)) return value;
      if (!badSequence(error)) throw error;
    }
  }
  throw new ApiError(409, 'Otra operación está en curso. Reintente.');
}

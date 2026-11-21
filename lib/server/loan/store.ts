import 'server-only';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { nativeToScVal, type Keypair } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from '../env';
import { observed } from './audit';
import { bytes, prepare, read, receipt, rpcServer } from './chain';
import type { Index } from './types';
export const REGISTRY = 'CAR55ERAQUCHESSOEW2UUWYAUC3PVK7LIV7MIP6IIWRNM7AV3TYVAGGB';
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
type RecordValue = { version: bigint; data: Buffer };
type Counts = { bonds: number; loans: number };
const encode = (v: unknown) => deflateSync(Buffer.from(json(v)));
const decode = <T>(b: Buffer): T => JSON.parse(inflateSync(b, { maxOutputLength: 1000000 }).toString()) as T;
const keyBytes = (key: string, signer: Keypair) => bytes(Buffer.from(digest(`${signer.publicKey()}:${key}`), 'hex'));
const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
const isIndex = (key: string) => key.startsWith('company:');
const LOANS = 0x80000000;
async function snapshot<T>(key: string, signer: Keypair): Promise<{ version: bigint; value: T | null }> {
  const k = keyBytes(key, signer), record = await read<RecordValue | null>(REGISTRY, 'get', [k]);
  if (!record) return { version: 0n, value: null };
  if (!isIndex(key)) return { version: record.version, value: decode<T>(record.data) };
  const counts = decode<Counts>(record.data);
  if (![counts.bonds, counts.loans].every(n => Number.isSafeInteger(n) && n >= 0 && n < LOANS)) throw new ApiError(502, 'Índice inválido.');
  const idx: Index = { bonds: [], loans: [] };
  for (const kind of ['bonds', 'loans'] as const) {
    // Fixed-size on-chain slots; reads may be paginated without rewriting history.
    for (let start = 0; start < counts[kind]; start += 16) {
      const rows = await Promise.all(Array.from({ length: Math.min(16, counts[kind] - start) }, async (_, n) => {
        const value = await read<Buffer | null>(REGISTRY, 'slot', [k, u32((kind === 'loans' ? LOANS : 0) + start + n)]);
        if (!value) throw new ApiError(502, 'Índice incompleto; restaure sus entradas antes de operar.');
        return decode(value);
      }));
      if (kind === 'bonds') idx.bonds.push(...rows as Index['bonds']);
      else idx.loans.push(...rows as Index['loans']);
    }
  }
  // A concurrent append/update must not return a mixed index snapshot.
  const after = await read<RecordValue>(REGISTRY, 'get', [k]);
  if (after.version !== record.version) throw new ApiError(409, 'El índice cambió; reintente.');
  return { version: record.version, value: idx as T };
}
export async function get<T>(key: string, signer = vaultKey()): Promise<T | null> {
  return (await snapshot<T>(key, signer)).value;
}
/** Operator-authorized CAS; account choice preserves a prepared payment's sequence. */
export async function update<T>(key: string, fn: (old: T | null) => Promise<T> | T, signer = vaultKey()) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const before = await snapshot<T>(key, signer), original = json(before.value);
    const value = await fn(before.value);
    if (original === json(value)) return value;
    const changes: { slot: number; data: Buffer }[] = [];
    let document: unknown = value;
    if (isIndex(key)) {
      const old = JSON.parse(original) as Index | null, idx = value as Index;
      for (const kind of ['bonds', 'loans'] as const) {
        if (idx[kind].length >= LOANS || idx[kind].length < (old?.[kind].length ?? 0)) throw new ApiError(409, 'Índice append-only inválido.');
        idx[kind].forEach((item, n) => {
          if (json(item) !== json(old?.[kind][n])) changes.push({ slot: (kind === 'loans' ? LOANS : 0) + n, data: encode(item) });
        });
      }
      document = { bonds: idx.bonds.length, loans: idx.loans.length };
    }
    const data = encode(document);
    if (data.length > 16384 || changes.length > 16 || changes.some(c => c.data.length > 16384)) throw new ApiError(409, 'Registro demasiado grande; divida la operación.');
    const args = [keyBytes(key, signer), nativeToScVal(before.version, { type: 'u64' }), bytes(data), nativeToScVal(changes.map(c => nativeToScVal(c, { type: { slot: ['symbol', 'u32'], data: ['symbol', 'bytes'] } })))];
    let hash: string | undefined;
    try {
      const tx = await prepare(signer.publicKey(), REGISTRY, 'put', args); tx.sign(signer);
      hash = Buffer.from(tx.hash()).toString('hex'); observed(`registry:${key}`, hash);
      // A timeout never authorizes a fresh transaction. Resolve this hash first.
      try { await rpcServer.sendTransaction(tx); } catch { /* poll exact hash */ }
      for (let n = 0; n < 40; n++) {
        if (await receipt(hash)) return value;
        await new Promise(r => setTimeout(r, 1500));
      }
      throw new ApiError(202, `Confirmación pendiente del registro: ${hash}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 202) throw error;
      const after = await snapshot<T>(key, signer);
      if (json(after.value) === json(value)) return value;
      if (after.version === before.version) throw error;
      // A confirmed conflict re-runs the callback on the new version.
    }
  }
  throw new ApiError(409, 'Otra operación está en curso. Reintente.');
}

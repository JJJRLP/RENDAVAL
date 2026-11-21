import 'server-only';
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { bondUsd, normalizeBond, type Bond } from '../../loan/model';
import { bondAsset, networkPassphrase, server } from './network';
import { a, BOND, BOOK, bool, bytes, decimal, i, invoke, issuerKey, once, RULES, sym, UNIT } from './chain';
import { digest, get, json, update } from './store';
import { indexKey, ownBond, verified } from './records';
import type { BondRecord, Index } from './types';
export function validateBond(input: unknown): Bond {
  const b = normalizeBond(input);
  if (!b || !b.issuer.trim() || b.issuer.length > 80 || !b.series.trim() || b.series.length > 24 || bondUsd(b) < 100 || bondUsd(b) > 400 || b.coupon < 0 || b.coupon > 30 || !/^\d{4}-\d{2}-\d{2}$/.test(b.maturity) || !(Date.parse(b.maturity) > Date.now() + 30 * 86400000) || new Date(b.maturity).toISOString().slice(0, 10) !== b.maturity)
    throw new ApiError(400, 'Declare un bono de USD 100–400, cupón 0–30 % y vencimiento posterior al préstamo.');
  return { ...b, issuer: b.issuer.trim(), series: b.series.trim() };
}
export async function register(wallet: string, input: Record<string, unknown>) {
  await verified(wallet);
  // No document bytes, filename, URL or arbitrary metadata accepted.
  if (Object.keys(input).some(k => !['bond', 'certificateHash'].includes(k)) || typeof input.certificateHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.certificateHash)) throw new ApiError(400, 'Envíe solo bond y certificateHash SHA-256; el certificado permanece en su navegador.');
  const bond = validateBond(input.bond), id = digest(json({ wallet, bond, certificateHash: input.certificateHash }));
  const record: BondRecord = { id, wallet, bond, certificateHash: input.certificateHash, face: BigInt(Math.round(bondUsd(bond) * 1e7)).toString(), series: `B${id.slice(0, 30)}`, createdAt: new Date().toISOString() };
  const saved = await update<BondRecord>(`bond:${id}`, old => old ?? record);
  await update<Index>(indexKey(wallet), old => {
    const idx = old ?? { bonds: [], loans: [] };
    if (!idx.bonds.includes(id)) idx.bonds.push(id);
    return idx;
  });
  return { ...saved, status: await get(`approved:${id}`) ? 'approved' : 'under_review', simulation: true };
}
export async function approve(wallet: string, id: string) {
  await verified(wallet);
  const b = await ownBond(wallet, id), key = issuerKey();
  const receipts: { hash: string; value: unknown }[] = [];
  receipts.push(await invoke(`approve-holder:${id}`, key, RULES, 'set_authorized', [a(BOND), a(wallet), bool(true)]));
  receipts.push(await invoke(`series:${id}`, key, BOOK, 'register_series', [sym(b.series), bytes(bondAsset().toXDRObject().toXDR())]));
  receipts.push(await invoke(`initial-price:${id}`, key, BOOK, 'publish_price', [sym(b.series), i(UNIT)]));
  // Unique durable outbox means approval can never mint twice after a lost response.
  receipts.push(await once(`issue:${id}`, key, async () => new TransactionBuilder(await server.loadAccount(key.publicKey()), { fee: '10000', networkPassphrase }).addOperation(Operation.payment({ destination: wallet, asset: bondAsset(), amount: decimal(BigInt(b.face)) })).setTimeout(300).build()));
  await update(`approved:${id}`, old => old ?? { hashes: receipts.map(r => r.hash), simulation: true });
  return { bondId: id, status: 'approved', simulation: true, hashes: receipts.map(r => r.hash) };
}

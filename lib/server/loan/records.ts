import 'server-only';
import { ApiError } from '../env';
import { readAttestation } from '../attestation';
import { get } from './store';
import { BOOK, read, a } from './chain';
import type { BondRecord, Index, Spec } from './types';
export async function verified(wallet: string) {
  const entry = await readAttestation(wallet);
  if (!entry) throw new ApiError(403, 'Verifique su empresa antes de continuar.');
  return { status: 'verified' as const, country: entry.country, receiptUrl: entry.receiptUrl };
}
export const indexKey = (wallet: string) => `company:${BOOK}:${wallet}`;
export const index = async (wallet: string) => await get<Index>(indexKey(wallet)) ?? { bonds: [], loans: [] };
export async function ownBond(wallet: string, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(400, 'Seleccione un bono.');
  const b = await get<BondRecord>(`bond:${id}`);
  if (!b || b.wallet !== wallet || !(await index(wallet)).bonds.includes(id)) throw new ApiError(403, 'Este bono no corresponde a su empresa.');
  return b;
}
export async function ownLoan(wallet: string, id: string) {
  if (!/^C[A-Z2-7]{55}$/.test(id)) throw new ApiError(400, 'Seleccione un préstamo.');
  const item = (await index(wallet)).loans.find(l => l.id === id);
  if (!item) throw new ApiError(403, 'Este préstamo no corresponde a su empresa.');
  const spec = await read<Spec>(BOOK, 'get_vault', [a(id)]);
  if (spec.borrower !== wallet) throw new ApiError(403, 'La bóveda pertenece a otra empresa.');
  return { ...item, spec, bond: await ownBond(wallet, item.bondId) };
}

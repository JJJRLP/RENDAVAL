import 'server-only';
import { createHash } from 'node:crypto';
import { Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, required } from '../env';
import { BS_PER_USD, LIMIT_MESSAGE, type Bond } from '../../loan/model';
import { bondAsset, networkPassphrase, server } from './network';
import { state } from './state';
export function validateBond(input: unknown): Bond {
  const b = input as Partial<Bond> | null;
  if (!b || typeof b.issuer !== 'string' || !b.issuer.trim() || b.issuer.length > 80 || typeof b.series !== 'string' || !b.series.trim() || b.series.length > 24 || typeof b.nominalBs !== 'number' || !Number.isFinite(b.nominalBs) || b.nominalBs < 696 || b.nominalBs > 2784 || typeof b.coupon !== 'number' || !Number.isFinite(b.coupon) || b.coupon < 0 || b.coupon > 30 || typeof b.maturity !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.maturity) || !(Date.parse(b.maturity) > Date.now() + 30 * 86400000) || new Date(b.maturity).toISOString().slice(0, 10) !== b.maturity)
    throw new ApiError(400, 'Revise los datos: valor entre Bs 696 y Bs 2.784, cupón entre 0 y 30 % y vencimiento posterior al préstamo.');
  return { issuer: b.issuer.trim(), series: b.series.trim(), nominalBs: b.nominalBs, coupon: b.coupon, maturity: b.maturity };
}
export async function register(wallet: string, input: unknown) {
  const bond = validateBond(input), signer = Keypair.fromSecret(required('BOND_ISSUER_SECRET_KEY'));
  if (signer.publicKey() !== bondAsset().getIssuer()) throw new ApiError(503, 'El registro no está disponible. Contacte al equipo de Rendaval.');
  // Load sequence BEFORE checking eligibility: concurrent registrations cannot both commit.
  const account = await server.loadAccount(signer.publicKey());
  const current = await state(wallet);
  if (current.limitReached) throw new ApiError(409, LIMIT_MESSAGE);
  if (!current.canRegister) throw new ApiError(409, 'Su bono ya está registrado o tiene una garantía en curso. Continúe desde su próximo paso.');
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase })
    .addMemo(Memo.hash(createHash('sha256').update(JSON.stringify(bond)).digest()))
    .addOperation(Operation.payment({ destination: wallet, asset: bondAsset(), amount: (bond.nominalBs / BS_PER_USD).toFixed(7) })).setTimeout(60).build();
  tx.sign(signer);
  try { const result = await server.submitTransaction(tx); return { hash: result.hash, bond }; }
  catch { throw new ApiError(409, 'No pudimos registrar el bono. Compruebe que su cuenta esté preparada y vuelva a intentar.'); }
}

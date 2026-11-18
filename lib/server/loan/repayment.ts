import 'server-only';
import { createHash } from 'node:crypto';
import { Keypair, Memo, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { terms, usdcAmount } from '../../loan/model';
import { badSequence, dollarAsset, explorer, lenderKey, networkPassphrase, server } from './network';
import { escrowFor, verified } from './state';
export const repaymentMemo = (contractId: string) => createHash('sha256').update(`vault-repay:${contractId}`).digest();
export function validRepayment(tx: Transaction, wallet: string, contractId: string, total: number) {
  const op = tx.operations[0];
  return tx.source === wallet && tx.operations.length === 1 && op.type === 'payment' && (!op.source || op.source === wallet) && op.destination === lenderKey().publicKey() && op.asset.equals(dollarAsset()) && op.amount === usdcAmount(total) && tx.memo.type === 'hash' && Buffer.from(tx.memo.value as Uint8Array).equals(repaymentMemo(contractId));
}
export async function repaymentFor(wallet: string, contractId: string, collateral: number) {
  // Traverse the complete account history, including after reload; never infer payment from client claims.
  let page = await server.transactions().forAccount(wallet).order('desc').limit(200).call();
  while (page.records.length) {
    for (const row of page.records) {
      if (!row.successful) continue;
      const tx = TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase);
      if (tx instanceof Transaction && validRepayment(tx, wallet, contractId, terms(collateral).total)) return { amount: terms(collateral).total, at: row.created_at, hash: row.hash, url: explorer('tx', row.hash) };
    }
    page = await page.next();
  }
  return null;
}
async function context(wallet: string) {
  await verified(wallet);
  const escrow = await escrowFor(wallet, true);
  if (!escrow || !(await server.loadAccount(lenderKey().publicKey())).data_attr[escrow.contractId]) throw new ApiError(409, 'Necesita un préstamo desembolsado para reembolsar.');
  return { escrow, paid: await repaymentFor(wallet, escrow.contractId, escrow.amount), total: terms(escrow.amount).total };
}
export async function topup(wallet: string) {
  const { escrow, paid, total } = await context(wallet);
  if (paid) return { reused: true, amount: '0.0000000' };
  const signer = lenderKey(), marker = `int:${createHash('sha256').update(escrow.contractId).digest('hex').slice(0, 56)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const lender = await server.loadAccount(signer.publicKey());
    if (lender.data_attr[marker]) return { reused: true, amount: Buffer.from(lender.data_attr[marker], 'base64').toString() };
    // Snapshot lender sequence BEFORE reading company balance/repayment to serialize assistance.
    if (await repaymentFor(wallet, escrow.contractId, escrow.amount)) return { reused: true, amount: '0.0000000' };
    const company = await server.loadAccount(wallet);
    const balance = company.balances.find(b => 'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === dollarAsset().getIssuer());
    const missing = Number(usdcAmount(Math.max(0, total - Number(balance?.balance ?? 0))));
    if (!missing) return { reused: true, amount: '0.0000000' };
    if (missing > terms(escrow.amount).interest + 0.01) throw new ApiError(409, 'Añada los dólares del capital a su cuenta para completar el reembolso. En esta prueba solo cubrimos el interés.');
    const tx = new TransactionBuilder(lender, { fee: '10000', networkPassphrase })
      .addOperation(Operation.payment({ destination: wallet, asset: dollarAsset(), amount: usdcAmount(missing) }))
      .addOperation(Operation.manageData({ name: marker, value: usdcAmount(missing) })).setTimeout(60).build();
    tx.sign(signer);
    try { const result = await server.submitTransaction(tx); return { hash: result.hash, amount: usdcAmount(missing), reused: false }; }
    catch (error) {
      if ((await server.loadAccount(signer.publicKey())).data_attr[marker]) return { reused: true, amount: usdcAmount(missing) };
      if (!badSequence(error)) throw new ApiError(502, 'No pudimos añadir el interés de prueba. Vuelva a intentar.');
    }
  }
  throw new ApiError(409, 'Hay otra operación en curso. Vuelva a intentar.');
}
export async function buildRepayment(wallet: string) {
  const { escrow, paid, total } = await context(wallet);
  if (paid) return { repaid: true as const, repayment: paid };
  const tx = new TransactionBuilder(await server.loadAccount(wallet), { fee: '10000', networkPassphrase })
    .addMemo(Memo.hash(repaymentMemo(escrow.contractId)))
    .addOperation(Operation.payment({ destination: lenderKey().publicKey(), asset: dollarAsset(), amount: usdcAmount(total) })).setTimeout(300).build();
  return { repaid: false as const, unsignedTransaction: tx.toXDR() };
}
export async function submitRepayment(wallet: string, signedXdr: unknown) {
  const { escrow, paid, total } = await context(wallet);
  if (paid) return { reused: true, repayment: paid };
  let tx: Transaction;
  try {
    if (typeof signedXdr !== 'string' || signedXdr.length > 20000) throw new Error();
    const parsed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    if (!(parsed instanceof Transaction) || !validRepayment(parsed, wallet, escrow.contractId, total) || !parsed.signatures.some(s => Keypair.fromPublicKey(wallet).verify(parsed.hash(), s.signature))) throw new Error();
    if (Number(parsed.fee) > 10000 || !parsed.timeBounds || Number(parsed.timeBounds.maxTime) === 0) throw new Error();
    tx = parsed;
  } catch { throw new ApiError(400, 'La confirmación no corresponde al reembolso de su préstamo. Vuelva a confirmar el pago.'); }
  const account = await server.loadAccount(wallet);
  if (BigInt(tx.sequence) !== BigInt(account.sequenceNumber()) + BigInt(1)) throw new ApiError(409, 'Su cuenta cambió. Vuelva a confirmar el reembolso.');
  try { const result = await server.submitTransaction(tx); return { hash: result.hash, reused: false }; }
  catch {
    const found = await repaymentFor(wallet, escrow.contractId, escrow.amount);
    if (found) return { reused: true, repayment: found };
    throw new ApiError(502, 'No pudimos confirmar su pago. Vuelva a intentar para comprobarlo.');
  }
}

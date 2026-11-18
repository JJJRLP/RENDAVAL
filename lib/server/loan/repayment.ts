import 'server-only';
import { createHash } from 'node:crypto';
import { FeeBumpTransaction, Keypair, Memo, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { terms, usdcAmount } from '../../loan/model';
import { badSequence, dollarAsset, explorer, lenderKey, networkPassphrase, server } from './network';
import { escrowFor, verified } from './state';
export const repaymentMemo = (contractId: string) => createHash('sha256').update(`vault-repay:${contractId}`).digest();
/** A wallet provider may wrap the payment in a fee bump to pay its fee; the payment itself is the inner transaction. */
const payment = (tx: Transaction | FeeBumpTransaction) => tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
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
      const tx = payment(TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase));
      if (validRepayment(tx, wallet, contractId, terms(collateral).total)) return { amount: terms(collateral).total, at: row.created_at, hash: row.hash, url: explorer('tx', row.hash) };
    }
    page = await page.next();
  }
  return null;
}
async function context(wallet: string, contractId: string) {
  await verified(wallet);
  const escrow = await escrowFor(wallet, contractId);
  if (!escrow || !(await server.loadAccount(lenderKey().publicKey())).data_attr[escrow.contractId]) throw new ApiError(409, 'Necesita un préstamo desembolsado para reembolsar.');
  return { escrow, paid: await repaymentFor(wallet, escrow.contractId, escrow.amount), total: terms(escrow.amount).total };
}
export async function topup(wallet: string, contractId: string) {
  const { escrow, paid } = await context(wallet, contractId);
  if (paid) return { reused: true, amount: '0.0000000' };
  const signer = lenderKey(), marker = `int:${createHash('sha256').update(escrow.contractId).digest('hex').slice(0, 56)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const lender = await server.loadAccount(signer.publicKey());
    if (lender.data_attr[marker]) return { reused: true, amount: Buffer.from(lender.data_attr[marker], 'base64').toString() };
    // Snapshot lender sequence BEFORE reading company balance/repayment to serialize assistance.
    if (await repaymentFor(wallet, escrow.contractId, escrow.amount)) return { reused: true, amount: '0.0000000' };
    // Each loan receives its own test interest once. Other loans' principal is
    // not spendable assistance for this loan, even when it shares the wallet.
    const missing = terms(escrow.amount).interest;
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
export async function buildRepayment(wallet: string, contractId: string) {
  const { escrow, paid, total } = await context(wallet, contractId);
  if (paid) return { repaid: true as const, repayment: paid };
  const tx = new TransactionBuilder(await server.loadAccount(wallet), { fee: '10000', networkPassphrase })
    .addMemo(Memo.hash(repaymentMemo(escrow.contractId)))
    .addOperation(Operation.payment({ destination: lenderKey().publicKey(), asset: dollarAsset(), amount: usdcAmount(total) })).setTimeout(300).build();
  return { repaid: false as const, unsignedTransaction: tx.toXDR() };
}
export async function submitRepayment(wallet: string, signedXdr: unknown, contractId: string) {
  const { escrow, paid, total } = await context(wallet, contractId);
  if (paid) return { reused: true, repayment: paid };
  let envelope: Transaction | FeeBumpTransaction, tx: Transaction, reason = 'unreadable';
  try {
    if (typeof signedXdr !== 'string' || signedXdr.length > 20000) throw new Error();
    envelope = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    tx = payment(envelope);
    const op = tx.operations[0];
    // Name the first mismatch (shape only, no secrets) so a provider-side change can be diagnosed from the logs.
    reason = tx.source !== wallet ? 'source' : tx.operations.length !== 1 ? 'operation-count' : op.type !== 'payment' ? `operation-${op.type}`
      : !validRepayment(tx, wallet, escrow.contractId, total) ? `payment-fields amount=${op.amount} memo=${tx.memo.type}`
      : !tx.signatures.some(s => Keypair.fromPublicKey(wallet).verify(tx.hash(), s.signature)) ? `signature count=${tx.signatures.length}`
      : !tx.timeBounds || Number(tx.timeBounds.maxTime) === 0 ? 'timebounds'
      : Number(tx.fee) > 1000000 ? `fee=${tx.fee}` : '';
    if (reason) throw new Error();
  } catch {
    console.error('[repay submit] rejected:', reason, 'feeBump:', typeof signedXdr === 'string' && signedXdr.length <= 20000 ? (() => { try { return TransactionBuilder.fromXDR(signedXdr, networkPassphrase) instanceof FeeBumpTransaction; } catch { return 'n/a'; } })() : 'n/a');
    throw new ApiError(400, 'No pudimos validar la confirmación de su pago. Vuelva a intentarlo.');
  }
  const account = await server.loadAccount(wallet);
  if (BigInt(tx.sequence) !== BigInt(account.sequenceNumber()) + BigInt(1)) throw new ApiError(409, 'Su cuenta cambió. Vuelva a confirmar el reembolso.');
  try { const result = await server.submitTransaction(envelope); return { hash: result.hash, reused: false }; }
  catch {
    const found = await repaymentFor(wallet, escrow.contractId, escrow.amount);
    if (found) return { reused: true, repayment: found };
    throw new ApiError(502, 'No pudimos confirmar su pago. Vuelva a intentar para comprobarlo.');
  }
}

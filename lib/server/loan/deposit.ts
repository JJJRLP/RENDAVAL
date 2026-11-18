import 'server-only';
import { Address, Transaction, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { escrowFor, verified } from './state';
import { networkPassphrase, send, tw } from './network';
async function available(wallet: string) {
  await verified(wallet);
  const escrow = await escrowFor(wallet);
  if (!escrow) throw new ApiError(409, 'Acepte las condiciones antes de depositar su garantía.');
  if (escrow.balance > 0) throw new ApiError(409, 'Su garantía ya recibió los bonos. No se permite un segundo depósito. Continúe con el desembolso.');
  return escrow;
}
export async function buildDeposit(wallet: string) {
  const escrow = await available(wallet);
  return tw<{ unsignedTransaction: string }>('/escrow/single-release/fund-escrow', { contractId: escrow.contractId, signer: wallet, amount: escrow.amount });
}
export async function submitDeposit(wallet: string, signedXdr: unknown) {
  const escrow = await available(wallet);
  if (typeof signedXdr !== 'string' || signedXdr.length > 200000) throw new ApiError(400, 'La confirmación del depósito no es válida. Reintente.');
  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    if (!(tx instanceof Transaction) || tx.source !== wallet || tx.operations.length !== 1 || !tx.signatures.length) throw new Error();
    const op = tx.operations[0];
    if (op.type !== 'invokeHostFunction' || (op.source && op.source !== wallet) || op.func.type !== 'hostFunctionTypeInvokeContract') throw new Error();
    const call = op.func.invokeContract;
    if (Address.fromScAddress(call.contractAddress).toString() !== escrow.contractId) throw new Error();
    // Compare the entire invocation to the server-built deposit (method AND all arguments).
    const expected = await buildDeposit(wallet);
    const fresh = TransactionBuilder.fromXDR(expected.unsignedTransaction, networkPassphrase);
    if (!(fresh instanceof Transaction)) throw new Error();
    const wanted = fresh.operations[0];
    if (wanted.type !== 'invokeHostFunction' || !Buffer.from(op.func.toXDR()).equals(wanted.func.toXDR()) || tx.sequence !== fresh.sequence) throw new Error();
    // Disallow injected authorization sub-invocations; their nonces/signatures may differ.
    const auth = op.auth ?? [], expectedAuth = wanted.auth ?? [];
    if (auth.length !== expectedAuth.length || auth.some((a, i) => !Buffer.from(a.rootInvocation.toXDR()).equals(expectedAuth[i].rootInvocation.toXDR()))) throw new Error();
    if (!call.args.map(scValToNative).length) throw new Error();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'La confirmación no corresponde a su depósito pendiente. Vuelva a confirmar el depósito.');
  }
  return send(signedXdr);
}

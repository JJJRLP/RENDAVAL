import 'server-only';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from '../env';
import { escrowFor, verified } from './state';
import { repaymentFor } from './repayment';
import { lenderKey, networkPassphrase, ProviderError, send, server, tw } from './network';
export async function settle(wallet: string) {
  await verified(wallet);
  let escrow = await escrowFor(wallet, true);
  if (escrow && !(await server.loadAccount(lenderKey().publicKey())).data_attr[escrow.contractId]) throw new ApiError(409, 'Primero debe recibir el desembolso del préstamo.');
  if (!escrow) throw new ApiError(409, 'No encontramos un préstamo para liquidar.');
  const repayment = await repaymentFor(wallet, escrow.contractId, escrow.amount);
  if (!repayment) throw new ApiError(409, 'Primero confirme el reembolso de su préstamo.');
  if (escrow.flags.released) return { status: 'closed' as const, repayment };
  const contractId = escrow.contractId;
  const execute = async (action: string, body: object, signer: Keypair) => {
    const built = await tw<{ unsignedTransaction: string }>(`/escrow/single-release/${action}`, { contractId, ...body });
    const tx = TransactionBuilder.fromXDR(built.unsignedTransaction, networkPassphrase); tx.sign(signer);
    return send(tx.toXDR());
  };
  try {
    if (escrow.milestones[0]?.status !== 'completed') {
      await execute('change-milestone-status', { milestoneIndex: '0', newEvidence: repayment.url, newStatus: 'completed', serviceProvider: vaultKey().publicKey() }, vaultKey());
    }
    escrow = (await escrowFor(wallet, true))!;
    if (!escrow.milestones[0]?.approved) await execute('approve-milestone', { milestoneIndex: '0', approver: lenderKey().publicKey() }, lenderKey());
    escrow = (await escrowFor(wallet, true))!;
    if (!escrow.flags.released) {
      try { await execute('release-funds', { releaseSigner: vaultKey().publicKey() }, vaultKey()); }
      catch (error) {
        if (error instanceof ProviderError && error.providerStatus === 400 && error.detail.includes('Escrow already in dispute')) return { status: 'release_pending' as const, repayment, providerMessage: error.detail };
        throw error;
      }
    }
  } catch (error) {
    // Another invocation may have advanced the same contract while this one waited.
    const latest = await escrowFor(wallet, true);
    if (latest?.flags.released) return { status: 'closed' as const, repayment };
    throw error;
  }
  const latest = await escrowFor(wallet, true);
  return { status: latest?.flags.released ? 'closed' as const : 'release_pending' as const, repayment };
}

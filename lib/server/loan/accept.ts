import 'server-only';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from '../env';
import { escrowsFor, state } from './state';
import { bondAsset, lenderKey, networkPassphrase, send, server, tw } from './network';
import { deploymentJournal, cleanJournal } from './deployment-journal';
import { bondUsd, LIMIT_MESSAGE } from '../../loan/model';
import { validateBond } from './register';
export async function accept(wallet: string, input?: unknown) {
  const signer = vaultKey();
  const current = await state(wallet);
  // Use the SAME snapshot for eligibility and journal generation. A second role
  // read here could observe a concurrent deployment and incorrectly advance it.
  const existing = [...current.loans, ...(current.setup?.escrow ? [current.setup] : [])];
  if (current.setup?.escrow) {
    await cleanJournal(`${wallet}:${existing.length - 1}`);
    return { contractId: current.setup.escrow.contractId, reused: true };
  }
  if (current.limitReached) throw new ApiError(409, LIMIT_MESSAGE);
  const journalKey = `${wallet}:${existing.length}`;
  if (current.bonds < 100 || current.bonds > 400) throw new ApiError(409, 'Registre primero un bono de entre 100 y 400 dólares.');
  const bond = input ? validateBond(input) : null;
  if (bond && Math.abs(bondUsd(bond) - current.bonds) > 0.000001) throw new ApiError(400, 'El valor declarado no coincide con sus bonos disponibles.');
  const description = bond ? JSON.stringify(bond) : `Bono registrado por USD ${current.bonds.toFixed(2)}. Datos originales referenciados por hash en la emisión.`;
  const signedXdr = await deploymentJournal(journalKey, async () => {
    if ((await escrowsFor(wallet)).length !== existing.length) throw new ApiError(409, 'Su garantía ya está creada. Vuelva a continuar.');
    const account = await server.loadAccount(signer.publicKey());
    const built = await tw<{ unsignedTransaction: string }>('/deployer/single-release', {
      signer: signer.publicKey(), engagementId: `vault-loan-${wallet}:${Date.now()}`, title: 'Garantía de préstamo Rendaval', description,
      roles: { serviceProvider: signer.publicKey(), receiver: wallet, approver: lenderKey().publicKey(), platformAddress: signer.publicKey(), releaseSigner: signer.publicKey(), disputeResolver: signer.publicKey() },
      amount: current.bonds, platformFee: 0, milestones: [{ description: 'Reembolso del préstamo confirmado' }], trustline: { address: bondAsset().getIssuer(), symbol: 'VBOND' },
    });
    const tx = TransactionBuilder.fromXDR(built.unsignedTransaction, networkPassphrase);
    if (!('sequence' in tx) || BigInt(tx.sequence) !== BigInt(account.sequenceNumber()) + BigInt(1)) throw new ApiError(409, 'Se está preparando otra operación. Vuelva a intentar en unos segundos.');
    tx.sign(signer);
    return tx.toXDR();
  });
  const result = await send(signedXdr);
  if (!result.contractId) throw new ApiError(502, 'Estamos confirmando su garantía. Vuelva a consultar antes de continuar.');
  if ((await escrowsFor(wallet)).some(e => e.contractId === result.contractId)) await cleanJournal(journalKey);
  return result;
}

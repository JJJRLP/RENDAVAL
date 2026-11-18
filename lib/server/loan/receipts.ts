import 'server-only';
import { Address, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { bondAsset, explorer, lenderKey, networkPassphrase, server } from './network';
import { deploymentHash } from './deployment-journal';
export type Receipt = { hash: string; url: string; at: string; label: string };
export async function receipts(wallet: string, contractId?: string, paid = false) {
  const result: Receipt[] = [];
  const company = await server.transactions().forAccount(wallet).order('desc').limit(100).call();
  for (const row of company.records) {
    if (!row.successful) continue;
    const tx = TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase);
    if (!(tx instanceof Transaction)) continue;
    for (const op of tx.operations) {
      const registration = op.type === 'payment' && op.destination === wallet && op.asset.equals(bondAsset()) && tx.source === bondAsset().getIssuer();
      const deposit = op.type === 'invokeHostFunction' && op.func.type === 'hostFunctionTypeInvokeContract' && Address.fromScAddress(op.func.invokeContract.contractAddress).toString() === contractId;
      const label = registration ? 'Registro del bono' : deposit ? 'Depósito de garantía' : '';
      if (label && !result.some(r => r.label === label)) result.push({ hash: row.hash, url: explorer('tx', row.hash), at: row.created_at, label });
    }
  }
  if (contractId) {
    const hash = await deploymentHash(wallet);
    if (hash) result.push({ hash, url: explorer('tx', hash), at: '', label: 'Creación de garantía' });
  }
  if (paid && contractId) {
    let page = await server.transactions().forAccount(lenderKey().publicKey()).order('desc').limit(200).call();
    for (let i = 0; i < 20; i++) {
      for (const row of page.records) {
        if (!row.successful) continue;
        const tx = TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase);
        if (tx instanceof Transaction && tx.operations.some(op => op.type === 'manageData' && op.name === contractId)) result.push({ hash: row.hash, url: explorer('tx', row.hash), at: row.created_at, label: 'Desembolso' });
      }
      if (result.some(r => r.label === 'Desembolso') || !page.records.length) break;
      page = await page.next();
    }
    if (!result.some(r => r.label === 'Desembolso')) throw new ApiError(502, 'El pago está confirmado. Estamos recuperando su fecha; vuelva a consultar.');
  }
  return result;
}

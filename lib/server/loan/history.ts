import 'server-only';
import { Address, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { terms } from '../../loan/model';
import { explorer, lenderKey, networkPassphrase, server } from './network';
import { validRepayment } from './repayment';
import type { Escrow } from './state';
import type { Receipt } from './receipts';

export const historyPages = (wallet: string) => Promise.all([
  server.transactions().forAccount(wallet).order('desc').limit(200).call(),
  server.transactions().forAccount(lenderKey().publicKey()).order('desc').limit(200).call(),
]);

/** One paginated scan per account, shared by all contracts. */
export async function loanHistory(wallet: string, escrows: Escrow[], paid: Set<string>, pages: Awaited<ReturnType<typeof historyPages>>) {
  const transactions = new Map<string, Receipt[]>();
  const repayments = new Map<string, { amount: number; at: string; hash: string; url: string }>();
  for (const e of escrows) transactions.set(e.contractId, []);
  await Promise.all([
    (async () => {
      if (!escrows.length) return;
      let page = pages[0];
      while (page.records.length) {
        for (const row of page.records) {
          if (!row.successful) continue;
          const envelope = TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase);
          // A wallet provider may wrap the company's transaction in a fee bump.
          const tx = envelope instanceof Transaction ? envelope : envelope.innerTransaction;
          for (const e of escrows) {
            if (paid.has(e.contractId) && !repayments.has(e.contractId) && validRepayment(tx, wallet, e.contractId, terms(e.amount).total)) repayments.set(e.contractId, { amount: terms(e.amount).total, at: row.created_at, hash: row.hash, url: explorer('tx', row.hash) });
            if (tx.operations.some(op => op.type === 'invokeHostFunction' && op.func.type === 'hostFunctionTypeInvokeContract' && Address.fromScAddress(op.func.invokeContract.contractAddress).toString() === e.contractId)) transactions.get(e.contractId)!.push({ hash: row.hash, at: row.created_at, url: explorer('tx', row.hash), label: 'Depósito de garantía' });
          }
        }
        if (page.records.length < 200) break;
        page = await page.next();
      }
    })(),
    (async () => {
      const remaining = new Set(paid);
      if (!remaining.size) return;
      let page = pages[1];
      while (page.records.length && remaining.size) {
        for (const row of page.records) {
          if (!row.successful) continue;
          const envelope = TransactionBuilder.fromXDR(row.envelope_xdr, networkPassphrase);
          // A wallet provider may wrap the company's transaction in a fee bump.
          const tx = envelope instanceof Transaction ? envelope : envelope.innerTransaction;
          for (const op of tx.operations) if (op.type === 'manageData' && remaining.delete(op.name)) transactions.get(op.name)!.push({ hash: row.hash, at: row.created_at, url: explorer('tx', row.hash), label: 'Desembolso' });
        }
        if (page.records.length < 200) break;
        if (remaining.size) page = await page.next();
      }
      if (remaining.size) throw new ApiError(502, 'El pago está confirmado. Estamos recuperando su fecha; vuelva a consultar.');
    })(),
  ]);
  return { transactions, repayments };
}

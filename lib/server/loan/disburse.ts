import 'server-only';
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { terms, usdcAmount } from '../../loan/model';
import { badSequence, dollarAsset, lenderKey, networkPassphrase, server } from './network';
import { escrowFor, verified } from './state';
export async function disburse(wallet: string, contractId: string) {
  await verified(wallet);
  const escrow = await escrowFor(wallet, contractId);
  if (!escrow || escrow.balance < escrow.amount) throw new ApiError(409, 'Aún estamos confirmando el depósito completo de su garantía. Vuelva a comprobar en unos segundos.');
  const signer = lenderKey(), amount = usdcAmount(terms(escrow.amount).loan);
  for (let attempt = 0; attempt < 4; attempt++) {
    // Marker and sequence come from ONE account snapshot, preventing concurrent double payment.
    const account = await server.loadAccount(signer.publicKey());
    if (account.data_attr[escrow.contractId]) return { reused: true, amount };
    const balance = account.balances.find(b => 'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === dollarAsset().getIssuer());
    if (!balance || Number(balance.balance) < Number(amount)) throw new ApiError(503, 'Los fondos de prueba disponibles no alcanzan para este desembolso. Su garantía está protegida; contacte al equipo de Rendaval y vuelva a intentar más tarde.');
    const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase })
      .addOperation(Operation.payment({ destination: wallet, asset: dollarAsset(), amount }))
      .addOperation(Operation.manageData({ name: escrow.contractId, value: amount })).setTimeout(60).build();
    tx.sign(signer);
    try { const result = await server.submitTransaction(tx); return { hash: result.hash, amount, reused: false }; }
    catch (error) {
      // A duplicate submission or gateway timeout may follow a successful commit.
      const confirmed = await server.loadAccount(signer.publicKey());
      if (confirmed.data_attr[escrow.contractId]) return { reused: true, amount };
      if (!badSequence(error) || attempt === 3) throw new ApiError(502, 'No pudimos confirmar el envío de dólares. Su garantía está protegida; reintente para comprobar el pago.');
      await new Promise(resolve => setTimeout(resolve, 200 + attempt * 250));
    }
  }
  throw new ApiError(502, 'Vuelva a comprobar el desembolso.');
}

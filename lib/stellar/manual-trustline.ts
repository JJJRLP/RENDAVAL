import { Asset, Horizon, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { HORIZON_URL, type CreditAsset } from './assets';
/** The company signs its own changeTrust. No issuer or operator key is involved. */
export async function enableWithSignature(address: string, asset: CreditAsset, sign: (xdr: string) => Promise<{ status: string; signedXdr?: string }>) {
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(address);
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) })).setTimeout(300).build();
  const signed = await sign(tx.toXDR());
  if (signed.status !== 'signed' || !signed.signedXdr) throw new Error('No se completó la firma. Puede reintentar la habilitación.');
  try { await server.submitTransaction(TransactionBuilder.fromXDR(signed.signedXdr, Networks.TESTNET)); }
  catch { throw new Error('No se confirmó la habilitación. Actualice el saldo antes de reintentar. Su cuenta necesita XLM para la reserva y la comisión.'); }
}

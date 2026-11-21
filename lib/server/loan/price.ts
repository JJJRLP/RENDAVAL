import 'server-only';
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { DEMO_PRICES } from '../../loan/model';
import { ApiError, vaultKey } from '../env';
import { badSequence, lenderKey, networkPassphrase, server } from './network';
import { escrowFor, verified } from './state';
import { repaymentFor } from './repayment';
import { priceKey } from './collateral-price';

export async function setPrice(wallet: string, contractId: string, price: unknown) {
  await verified(wallet);
  if (typeof price !== 'number' || !DEMO_PRICES.includes(price))
    throw new ApiError(400, 'Seleccione uno de los precios de simulación.');
  const signer = vaultKey(), name = priceKey(contractId);
  const value = price === 1 ? null : `1:${price}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    // Recheck ownership and stage on retries; snapshot sequence before validation.
    const account = await server.loadAccount(signer.publicKey());
    const escrow = await escrowFor(wallet, contractId);
    const [lender, repaid] = await Promise.all([
      server.loadAccount(lenderKey().publicKey()), repaymentFor(wallet, contractId, escrow.amount),
    ]);
    if (escrow.flags.released || !lender.data_attr[contractId] || repaid)
      throw new ApiError(409, 'Solo puede simular el precio de un préstamo activo.');
    if (value === null ? account.data_attr[name] === undefined : account.data_attr[name] === Buffer.from(value).toString('base64'))
      return { price, reused: true };
    const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase })
      .addOperation(Operation.manageData({ name, value })).setTimeout(60).build();
    tx.sign(signer);
    try { const result = await server.submitTransaction(tx); return { price, hash: result.hash, reused: false }; }
    catch (error) {
      if (!badSequence(error)) throw new ApiError(502, 'No pudimos confirmar el precio. Vuelva a intentar para comprobarlo.');
    }
  }
  throw new ApiError(409, 'Hay otra operación en curso. Vuelva a intentar.');
}

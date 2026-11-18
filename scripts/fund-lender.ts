// node --env-file=.env.local --conditions=react-server --import tsx scripts/fund-lender.ts
import { Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { dollarAsset, lenderKey, networkPassphrase, server } from '../lib/server/loan/network';
async function main() {
  const lender = lenderKey(), amount = '2500.0000000';
  const account = await server.loadAccount(lender.publicKey());
  const paths = await server.strictReceivePaths([Asset.native()], dollarAsset(), amount).call();
  const best = paths.records.sort((a, b) => Number(a.source_amount) - Number(b.source_amount))[0];
  if (!best) throw new Error('No testnet DEX path available');
  const maximum = (Number(best.source_amount) * 1.02).toFixed(7);
  const native = account.balances.find(b => b.asset_type === 'native');
  if (!native || Number(native.balance) < Number(maximum) + 10) throw new Error('Insufficient lender XLM; no transaction submitted');
  const path = best.path.map(a => a.asset_type === 'native' ? Asset.native() : new Asset(a.asset_code!, a.asset_issuer!));
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase }).addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: maximum, destination: lender.publicKey(), destAsset: dollarAsset(), destAmount: amount, path })).setTimeout(60).build();
  tx.sign(lender);
  const result = await server.submitTransaction(tx);
  console.log(JSON.stringify({ hash: result.hash, receivedUSDC: amount, quotedXLM: best.source_amount, maxXLM: maximum, before: account.balances, after: (await server.loadAccount(lender.publicKey())).balances }, null, 2));
}
main().catch(() => { console.error('Treasury funding failed; inspect liquidity and lender balances.'); process.exitCode = 1; });

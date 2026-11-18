// Offline transaction-shape checks; no network requests or account mutations.
import assert from 'node:assert/strict';
import { Account, Asset, Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { repaymentMemo, validRepayment } from '../lib/server/loan/repayment';
import { dollarAsset, lenderKey, networkPassphrase } from '../lib/server/loan/network';
import { terms, usdcAmount } from '../lib/loan/model';
const wallet = Keypair.random().publicKey(), other = Keypair.random().publicKey(), contract = 'validation-contract';
const total = terms(400).total;
const build = (options: { source?: string; destination?: string; amount?: string; asset?: Asset; memo?: string; extra?: boolean; opSource?: string } = {}) => {
  const tx = new TransactionBuilder(new Account(options.source ?? wallet, '1'), { fee: '10000', networkPassphrase })
    .addMemo(Memo.hash(repaymentMemo(options.memo ?? contract)))
    .addOperation(Operation.payment({ destination: options.destination ?? lenderKey().publicKey(), asset: options.asset ?? dollarAsset(), amount: options.amount ?? usdcAmount(total), ...(options.opSource ? { source: options.opSource } : {}) }));
  if (options.extra) tx.addOperation(Operation.manageData({ name: 'extra', value: 'x' }));
  return tx.setTimeout(60).build();
};
assert.equal(usdcAmount(total), '201.3333333');
assert.ok(validRepayment(build(), wallet, contract, total));
for (const mutation of [{ source: other }, { destination: other }, { amount: '201.3333334' }, { asset: Asset.native() }, { memo: 'other-contract' }, { extra: true }, { opSource: other }]) assert.equal(validRepayment(build(mutation), wallet, contract, total), false);
console.log('PASS: rounded amount, valid payment; wrong source, destination, amount, asset, memo, extra operation and operation source rejected.');

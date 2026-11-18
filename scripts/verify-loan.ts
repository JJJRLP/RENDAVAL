// node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-loan.ts
// Real testnet helpers; only interactive Pollar authentication is bypassed.
import assert from 'node:assert/strict';
import { Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { topup, buildRepayment, submitRepayment } from '../lib/server/loan/repayment';
import { settle } from '../lib/server/loan/settle';
import { attest } from '../lib/server/attestation';
import { register } from '../lib/server/loan/register';
import { accept } from '../lib/server/loan/accept';
import { buildDeposit, submitDeposit } from '../lib/server/loan/deposit';
import { disburse } from '../lib/server/loan/disburse';
import { escrowsFor, escrowFor, state } from '../lib/server/loan/state';
import { bondAsset, dollarAsset, lenderKey, networkPassphrase, server, ProviderError } from '../lib/server/loan/network';
import { exampleBonds, LIMIT_MESSAGE } from '../lib/loan/model';
const dollars = async () => Number((await server.loadAccount(lenderKey().publicKey())).balances.find(b => 'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === dollarAsset().getIssuer())?.balance ?? 0);
async function main() {
  const historical = await escrowsFor('GA4J2HFY45VDAX6T7YFMOXRAWXVX5RCQFI3Y6W6BM3NFW4T5LJ4VNYF4');
  console.log('historicalReadOnly', historical.map(e => ({ contractId: e.contractId, roles: e.roles, amount: e.amount })));
  const company = Keypair.random(), wallet = company.publicKey();
  console.log('company', wallet);
  assert.ok((await fetch(`https://friendbot.stellar.org?addr=${wallet}`)).ok);
  const setup = new TransactionBuilder(await server.loadAccount(wallet), { fee: '10000', networkPassphrase }).addOperation(Operation.changeTrust({ asset: dollarAsset() })).addOperation(Operation.changeTrust({ asset: bondAsset() })).setTimeout(60).build();
  setup.sign(company); await server.submitTransaction(setup);
  await attest(wallet, `multi-${crypto.randomUUID()}`);
  const before = await dollars(); console.log('treasuryBefore', before);
  const ids: string[] = [];
  async function borrow(index: number) {
    const bond = exampleBonds[index];
    assert.equal((await state(wallet)).canRegister, true);
    console.log('register', index, await register(wallet, bond));
    await assert.rejects(() => register(wallet, bond), { status: 409 });
    const deployed = await accept(wallet, bond); assert.ok(deployed.contractId);
    const id = deployed.contractId; ids.push(id);
    assert.equal((await accept(wallet, bond)).contractId, id);
    await assert.rejects(() => disburse(wallet, id), { status: 409 });
    const wrong = new TransactionBuilder(await server.loadAccount(wallet), { fee: '10000', networkPassphrase }).addOperation(Operation.manageData({ name: 'wrong', value: 'test' })).setTimeout(60).build(); wrong.sign(company);
    await assert.rejects(() => submitDeposit(wallet, wrong.toXDR(), id), { status: 400 });
    const built = await buildDeposit(wallet, id);
    const tx = TransactionBuilder.fromXDR(built.unsignedTransaction, networkPassphrase); tx.sign(company);
    await submitDeposit(wallet, tx.toXDR(), id);
    console.log('disburse', index, await disburse(wallet, id));
    const snapshot = await server.loadAccount(lenderKey().publicKey());
    assert.equal((await disburse(wallet, id)).reused, true);
    assert.equal((await server.loadAccount(lenderKey().publicKey())).sequenceNumber(), snapshot.sequenceNumber());
    await assert.rejects(() => buildDeposit(wallet, id), { status: 409 });
    return id;
  }
  async function repay(id: string) {
    console.log('topup', id, await topup(wallet, id));
    const built = await buildRepayment(wallet, id);
    if (!built.repaid) {
      const tx = TransactionBuilder.fromXDR(built.unsignedTransaction, networkPassphrase); tx.sign(company);
      console.log('repay', id, await submitRepayment(wallet, tx.toXDR(), id));
      assert.equal((await submitRepayment(wallet, tx.toXDR(), id)).reused, true);
    }
    console.log('settle', id, await settle(wallet, id));
    const snapshot = await server.loadAccount(lenderKey().publicKey());
    await topup(wallet, id); assert.equal((await buildRepayment(wallet, id)).repaid, true);
    await settle(wallet, id);
    assert.equal((await server.loadAccount(lenderKey().publicKey())).sequenceNumber(), snapshot.sequenceNumber());
  }
  try {
    const a = await borrow(0), b = await borrow(1);
    const two = await state(wallet);
    assert.equal(two.loans.length, 2); assert.ok(two.loans.every(l => l.stage === 'active'));
    assert.deepEqual(two.loans.map(l => l.terms.loan).sort((a,b) => a-b), [150,200]);
    for (const l of two.loans) assert.equal(Date.parse(l.terms.dueDate) - Date.parse(l.transactions.find(t => t.label === 'Desembolso')!.at), 30 * 86400000);
    console.log('twoIndependent', two.loans.map(l => ({ id: l.escrow!.contractId, stage: l.stage, terms: l.terms, bond: l.bond })));
    await assert.rejects(() => escrowFor(lenderKey().publicKey(), a), { status: 403 });
    console.log('foreignContract', '403 refused by shared ownership validator');
    await repay(a);
    const afterA = await state(wallet);
    assert.equal(afterA.loans.find(l => l.escrow!.contractId === a)!.stage, 'repaid_release_pending');
    assert.equal(afterA.loans.find(l => l.escrow!.contractId === b)!.stage, 'active');
    const c = await borrow(2);
    for (let i = 0; i < 3; i++) {
      const start = performance.now(), current = await state(wallet);
      console.log('stateThree', { ms: Math.round(performance.now() - start), stages: current.loans.map(l => l.stage), openLoans: current.openLoans, locked: current.locked });
      assert.equal(current.openLoans, 3); assert.equal(current.limitReached, true);
    }
    await assert.rejects(() => register(wallet, exampleBonds[0]), { status: 409, message: LIMIT_MESSAGE });
    console.log('fourthRefused', LIMIT_MESSAGE);
    await repay(b); await repay(c);
  } finally {
    // Never strand borrowed treasury funds when a later assertion fails.
    for (const id of ids) {
      const account = await server.loadAccount(lenderKey().publicKey());
      if (account.data_attr[id]) {
        const built = await buildRepayment(wallet, id);
        if (!built.repaid) { await topup(wallet, id); const payment = await buildRepayment(wallet, id); if (!payment.repaid) { const tx = TransactionBuilder.fromXDR(payment.unsignedTransaction, networkPassphrase); tx.sign(company); await submitRepayment(wallet, tx.toXDR(), id); } }
      }
    }
    const after = await dollars(); console.log('treasuryFinal', { before, after, difference: after - before });
    assert.ok(Math.abs(after - before) < 0.000001);
  }
  console.log('PASS multi-loan testnet');
}
main().catch(error => { console.error(error instanceof ProviderError ? JSON.stringify({ providerStatus: error.providerStatus, detail: error.detail }) : error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });

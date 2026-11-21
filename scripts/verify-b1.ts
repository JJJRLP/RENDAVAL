// Real provider/testnet journey through server services. Pollar login alone is replaced by an in-memory company key.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Asset, Keypair, Networks, Operation, TransactionBuilder, scValToNative, StrKey } from '@stellar/stellar-sdk';
import { dispatch } from '../lib/server/loan/route';
import { createSession, simulate } from '../lib/server/didit';
import { status } from '../lib/server/kyb';
import { readAttestation } from '../lib/server/attestation';
import { server, bondAsset, dollarAsset } from '../lib/server/loan/network';
import { a, balance, BOND, BOOK, decimal, read, rpcServer, UNIT, USD } from '../lib/server/loan/chain';
import { json } from '../lib/server/loan/store';
import { observeTransactions } from '../lib/server/loan/audit';
const file = 'scripts/evidence/b1-testnet.json';
const company = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update('rendaval-b1-company-v1').digest());
const wallet = company.publicKey();
type Evidence = { wallet: string; transactions: { label: string; hash: string }[]; steps: Record<string, unknown>; completed?: string; grossLenderSpend: string; budget?: Record<string, string> };
const e: Evidence = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { wallet, transactions: [], steps: {}, grossLenderSpend: '0' };
assert.equal(e.wallet, wallet);
function save() { const s = json(e); assert(!/\bS[A-Z2-7]{55}\b/.test(s)); writeFileSync(file, s + '\n'); }
observeTransactions((label, hash) => { if (!e.transactions.some(t => t.hash === hash)) e.transactions.push({ label, hash }); save(); });
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (name in e.steps) return e.steps[name] as T;
  console.log(name);
  const value = await fn(); e.steps[name] = value; save(); return value;
}
async function signed(id: string, action: 'deposit' | 'open' | 'repay' | 'claim') {
  const built = await dispatch(wallet, `${action}/build`, { contractId: id }) as { unsignedTransaction?: string; completed?: boolean };
  if (built.completed) return { completed: true };
  assert(built.unsignedTransaction);
  const tx = TransactionBuilder.fromXDR(built.unsignedTransaction, Networks.TESTNET); tx.sign(company);
  return dispatch(wallet, `${action}/submit`, { contractId: id, signedXdr: tx.toXDR() });
}
async function move(id: string, target: number) {
  for (let n = 0; n < 30; n++) {
    const r = await dispatch(wallet, 'price', { contractId: id, price: target }) as { status: string; nextChangeAt: number; price: number };
    console.log('price', r.price, r.status);
    if (r.status === 'complete') return r;
    await new Promise(r => setTimeout(r, 10000));
  }
  throw Error('Price updates did not finish');
}
async function spend<T>(label: string, amount: bigint, fn: () => Promise<T>) {
  e.budget ??= {};
  e.budget[label] ??= amount.toString();
  const gross = Object.values(e.budget).reduce((sum, value) => sum + BigInt(value), 0n);
  assert(gross <= 400n * UNIT, 'Lender budget exceeded before submission');
  e.grossLenderSpend = decimal(gross); save();
  return fn();
}
async function verifyAtomicTransfers() {
  if (e.steps.atomicTransfers) return;
  const movements: { label: string; hash: string; token: string; from: string; to: string; amount: string }[] = [];
  async function inspect(label: string, hash: string) {
    const tx = await rpcServer.getTransaction(hash); assert.equal(tx.status, 'SUCCESS', label);
    if (tx.status !== 'SUCCESS') throw Error('Transaction unavailable');
    const events = [...(tx.events?.contractEventsXdr ?? []).flat(), ...(tx.events?.transactionEventsXdr ?? []).map(x => x.event)];
    for (const event of events) {
      if (!event?.contractId) continue;
      const topics = event.body.v0.topics.map(scValToNative), data = scValToNative(event.body.v0.data);
      if (topics[0] !== 'transfer') continue;
      movements.push({ label, hash, token: StrKey.encodeContract(event.contractId.value), from: topics[1], to: topics[2], amount: String(typeof data === 'bigint' ? data : data.amount) });
    }
  }
  function transfer(label: string, token: string, from: string, to: string, amount: string) {
    assert(movements.some(m => m.label === label && m.token === token && m.from === from && m.to === to && m.amount === amount), `Missing atomic transfer ${label}`);
  }
  for (const name of ['repaid', 'liquidated']) {
    const setup = e.steps[name + '-accept'] as { contractId: string };
    const funded = e.steps[name + '-fund'] as { escrowId: string; hashes: string[] };
    const opened = e.steps[name + '-open'] as { hash: string };
    await inspect(name + '-release', funded.hashes.at(-1)!);
    await inspect(name + '-open', opened.hash);
    transfer(name + '-release', USD, funded.escrowId, setup.contractId, '498500000');
    transfer(name + '-open', USD, setup.contractId, wallet, '498500000');
    assert.equal(movements.filter(m => m.label === name + '-release' && m.token === USD && m.from === funded.escrowId && m.to !== setup.contractId).reduce((n, m) => n + BigInt(m.amount), 0n), 1500000n);
    assert.equal(await balance(USD, funded.escrowId), 0n);
    assert.equal(await balance(USD, setup.contractId), 0n);
  }
  const repaid = e.steps['repaid-final'] as { loan: { lender: string } };
  const sold = e.steps['liquidated-final'] as { loan: { lender: string } };
  await inspect('repay', (e.steps.repay as { hash: string }).hash);
  await inspect('liquidate', (e.steps.execution as { hash: string }).hash);
  transfer('repay', USD, wallet, BOOK, '503333334');
  transfer('repay', USD, BOOK, repaid.loan.lender, '503333334');
  transfer('repay', BOND, (e.steps['repaid-accept'] as { contractId: string }).contractId, wallet, '1000000000');
  transfer('liquidate', USD, sold.loan.lender, BOOK, '534375000');
  transfer('liquidate', USD, BOOK, wallet, '31041666');
  transfer('liquidate', BOND, (e.steps['liquidated-accept'] as { contractId: string }).contractId, sold.loan.lender, '1000000000');
  const h = await server.transactions().transaction((e.steps.execution as { hash: string }).hash).call();
  assert(Date.parse(h.created_at) / 1000 >= (e.steps.default as { cureDeadline: number }).cureDeadline);
  e.steps.atomicTransfers = movements; save();
}
async function main() {
  if (e.completed) {
    const repaid = e.steps['repaid-final'] as { loan: { principal: string } };
    const liquidated = e.steps['liquidated-final'] as { loan: { principal: string; proceeds: string } };
    const topup = e.steps.topup as { amount: string };
    const gross = BigInt(repaid.loan.principal) + BigInt(liquidated.loan.principal) + BigInt(Math.round(Number(topup.amount) * 1e7)) + BigInt(liquidated.loan.proceeds);
    assert(gross <= 400n * UNIT); e.grossLenderSpend = decimal(gross);
    await verifyAtomicTransfers();
    e.steps.finalState = await dispatch(wallet, 'state'); save();
    console.log('Already complete; refreshed final state. Gross lender spend:', e.grossLenderSpend); return;
  }
  await step('friendbot', async () => {
    try { await server.loadAccount(wallet); return { existing: true }; } catch { /* fresh account */ }
    const r = await fetch(`https://friendbot.stellar.org/?addr=${wallet}`); assert(r.ok); const b = await r.json(); return { hash: b.hash ?? b.transaction_hash };
  });
  await step('trustlines', async () => {
    const builder = new TransactionBuilder(await server.loadAccount(wallet), { fee: '10000', networkPassphrase: Networks.TESTNET });
    for (const asset of [bondAsset(), dollarAsset()]) builder.addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }));
    const tx = builder.setTimeout(120).build(); tx.sign(company); const r = await server.submitTransaction(tx); return { hash: r.hash };
  });
  await step('verification', async () => {
    const existing = await readAttestation(wallet); if (existing) return existing;
    const session = await step('didit-session', () => createSession(wallet, 'http://localhost:3017', 'BO'));
    await simulate(wallet, session.sessionId); return status(wallet, session.sessionId, true);
  });
  for (const name of ['repaid', 'liquidated'] as const) {
    const b = await step(name + '-declare', () => dispatch(wallet, 'register', { bond: { issuer: 'Empresa demo B1', series: name, nominal: 100, currency: 'USD', coupon: 7, maturity: '2028-12-31' }, certificateHash: createHash('sha256').update('Demo depository certificate B1 ' + name).digest('hex') })) as { id: string };
    assert.equal((await dispatch(wallet, 'state') as { bondRecords: { id: string; status: string }[] }).bondRecords.find(x => x.id === b.id)?.status, e.steps[name + '-approve'] ? 'approved' : 'under_review');
    await step(name + '-approve', () => dispatch(wallet, 'approve', { bondId: b.id }));
    const v = await step(name + '-accept', () => dispatch(wallet, 'accept', { bondId: b.id })) as { contractId: string };
    const id = v.contractId;
    await step(name + '-deposit', () => signed(id, 'deposit'));
    await spend(name + '-fund', 50n * UNIT, () => step(name + '-fund', () => dispatch(wallet, 'fund', { contractId: id })));
    await step(name + '-open', () => signed(id, 'open'));
    if (name === 'repaid') {
      await step('margin-down', () => move(id, 0.65));
      const margin = await read<{ loan: { status: string[] } }>(BOOK, 'get_loan', [a(id)]); assert.equal(margin.loan.status[0], e.steps['repay'] ? 'Repaid' : e.steps['margin-up'] ? 'Active' : 'Margin');
      await step('margin-up', () => move(id, 1));
      await spend('topup', 4833334n, () => step('topup', () => dispatch(wallet, 'repay/topup', { contractId: id })));
      await step('repay', () => signed(id, 'repay'));
      assert.equal(await balance(BOND, wallet), 100n * UNIT);
    } else {
      await step('default-price', () => move(id, 0.5625));
      await step('default', () => dispatch(wallet, 'default', { contractId: id }));
      await spend('execution', 534375000n, () => step('execution', async () => {
        for (;;) {
          const r = await dispatch(wallet, 'liquidate', { contractId: id }) as { status: string };
          if (r.status === 'Liquidated') return r;
          e.steps['cure-wait-observed'] = r; save(); await new Promise(r => setTimeout(r, 10000));
        }
      }));
      const credit = await read<bigint>(BOOK, 'claimable', [a(wallet)]);
      e.steps['surplus-credit'] = credit.toString();
      await step('claim', () => signed(wallet, 'claim'));
      assert.equal(await read<bigint>(BOOK, 'claimable', [a(wallet)]), 0n);
    }
    e.steps[name + '-final'] = await read(BOOK, 'get_loan', [a(id)]); save();
    assert.equal(await balance(BOND, id), 0n);
  }
  assert(Number(e.grossLenderSpend) <= 400);
  e.steps.finalState = await dispatch(wallet, 'state');
  e.steps.finalUsdc = (await balance(USD, wallet)).toString();
  await verifyAtomicTransfers();
  e.completed = new Date().toISOString(); save(); console.log('B1 journey complete');
}
main().catch(error => { console.error(error instanceof Error ? error.stack : 'Failed'); process.exitCode = 1; });

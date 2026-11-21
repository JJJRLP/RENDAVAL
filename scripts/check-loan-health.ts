/** Offline regression: no network, accounts or transactions. */
import assert from 'node:assert/strict';
import { Account, Keypair, Transaction, TransactionBuilder, Operation, Memo } from '@stellar/stellar-sdk';
import { DEMO_PRICES, loanHealth, terms } from '../lib/loan/model';
import { priceKey, readPrice } from '../lib/server/loan/collateral-price';
import { setPrice } from '../lib/server/loan/price';
import { handle } from '../lib/server/loan/route';
import { repaymentMemo } from '../lib/server/loan/repayment';
import { server, dollarAsset, networkPassphrase } from '../lib/server/loan/network';
import { VBOND } from '../lib/stellar/assets';

async function main() {
  for (const face of [100, 200, 400, 1000]) {
    assert.deepEqual(DEMO_PRICES.map(price => loanHealth(terms(face).total, face * price).level), ['ok', 'ok', 'warning', 'risk']);
  }
  assert.equal(loanHealth(70, 100).level, 'warning');
  assert.equal(loanHealth(85, 100).level, 'risk');
  assert.equal(loanHealth(1, 0).level, 'risk');
  const vault = Keypair.random(), lender = Keypair.random(), wallet = Keypair.random().publicKey();
  process.env.VAULT_SECRET_KEY = vault.secret();
  process.env.LENDER_SECRET_KEY = lender.secret();
  process.env.TRUSTLESS_WORK_API_KEY = 'offline';
  process.env.POLLAR_SECRET_KEY = 'sec_testnet_offline';
  process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY = 'pub_testnet_offline';
  const id = 'C' + 'A'.repeat(55), other = 'C' + 'B'.repeat(55);
  assert.ok(Buffer.byteLength(priceKey(id)) <= 64);
  assert.equal(readPrice({}, id), 1);
  const data = { [priceKey(id)]: Buffer.from('1:0.65').toString('base64') };
  assert.equal(readPrice(data, id), 0.65);
  assert.equal(readPrice(data, other), 1);
  assert.throws(() => readPrice({ [priceKey(id)]: Buffer.from('1:0').toString('base64') }, id));
  const escrow = { contractId: id, signer: vault.publicKey(), amount: 400, balance: 400, engagementId: `vault-loan-${wallet}:123`, roles: { platformAddress: vault.publicKey(), approver: lender.publicKey(), receiver: wallet, serviceProvider: vault.publicKey(), releaseSigner: vault.publicKey(), disputeResolver: vault.publicKey() }, trustline: { address: VBOND.issuer, symbol: 'VBOND' }, flags: { released: false, resolved: false, disputed: false } };
  const originalFetch = globalThis.fetch, originalLoad = server.loadAccount, originalTransactions = server.transactions, originalSubmit = server.submitTransaction;
  let verified = true, disbursed = true, repaid = false, submitted = 0;
  const repayment = new TransactionBuilder(new Account(wallet, '1'), { fee: '10000', networkPassphrase })
    .addMemo(Memo.hash(repaymentMemo(id))).addOperation(Operation.payment({ destination: lender.publicKey(), asset: dollarAsset(), amount: terms(400).total.toFixed(7) })).setTimeout(60).build();
  const entries: Record<string, string> = {};
  try {
    globalThis.fetch = async input => {
      if (String(input) === 'https://server.api.pollar.xyz/v3/tokens/verify') return Response.json({ code: 'SERVER_TOKEN_VERIFIED', content: { network: 'testnet', wallet } });
      if (String(input).startsWith('https://dev.api.trustlesswork.com/helper/')) return Response.json([escrow]);
      if (String(input).includes('/data/kyb:')) return verified ? Response.json({ value: Buffer.from('offline').toString('base64') }) : new Response(null, { status: 404 });
      throw new Error('Unexpected network request');
    };
    server.loadAccount = async address => Object.assign(new Account(address, '1'), { data_attr: address === vault.publicKey() ? entries : disbursed ? { [id]: 'MQ==' } : {} }) as unknown as Awaited<ReturnType<typeof originalLoad>>;
    server.transactions = (() => ({ forAccount: () => ({ order: () => ({ limit: () => ({ call: async () => ({ records: repaid ? [{ successful: true, envelope_xdr: repayment.toXDR(), created_at: '2026-01-01', hash: 'offline' }] : [] }) }) }) }) })) as unknown as typeof server.transactions;
    server.submitTransaction = (async tx => {
      assert.ok(tx instanceof Transaction);
      assert.equal(tx.operations.length, 1);
      const op = tx.operations[0]; assert.equal(op.type, 'manageData');
      if (op.type === 'manageData') { assert.equal(op.name, priceKey(id)); if (op.value) entries[op.name] = Buffer.from(op.value).toString('base64'); else delete entries[op.name]; }
      submitted++; return { hash: 'offline' };
    }) as typeof server.submitTransaction;
    await assert.rejects(() => setPrice(wallet, other, 0.65), { status: 403 });
    escrow.roles.receiver = Keypair.random().publicKey();
    await assert.rejects(() => setPrice(wallet, id, 0.65), { status: 409 });
    escrow.roles.receiver = wallet;
    for (const flag of ['released', 'resolved', 'disputed'] as const) {
      escrow.flags[flag] = true;
      await assert.rejects(() => setPrice(wallet, id, 0.65), { status: 409 });
      escrow.flags[flag] = false;
    }
    disbursed = false;
    await assert.rejects(() => setPrice(wallet, id, 0.65), { status: 409 }); disbursed = true;
    verified = false;
    await assert.rejects(() => setPrice(wallet, id, 0.65), { status: 403 }); verified = true;
    for (const price of [0, -1, 0.7, '0.65', null, NaN]) await assert.rejects(() => setPrice(wallet, id, price), { status: 400 });
    repaid = true;
    await assert.rejects(() => setPrice(wallet, id, 0.65), { status: 409 }); repaid = false;
    assert.equal((await handle(new Request('http://localhost/api/loan/price', { method: 'POST' }), 'price')).status, 401);
    const request = (contractId: string) => new Request('http://localhost/api/loan/price', { method: 'POST', headers: { Authorization: 'Bearer offline', 'Content-Type': 'application/json' }, body: JSON.stringify({ contractId, price: 1, wallet: Keypair.random().publicKey() }) });
    assert.equal((await handle(request(other), 'price')).status, 403);
    assert.equal((await handle(request(id), 'price')).status, 200); // Body wallet is ignored.
    assert.equal(submitted, 0);
    for (const serviceProvider of [wallet, vault.publicKey()]) {
      escrow.roles.serviceProvider = serviceProvider;
      await setPrice(wallet, id, 0.65); assert.equal(readPrice(entries, id), 0.65);
      await setPrice(wallet, id, 1); assert.equal(entries[priceKey(id)], undefined);
      await setPrice(wallet, id, 1);
    }
    assert.equal(submitted, 4);
  } finally { globalThis.fetch = originalFetch; server.loadAccount = originalLoad; server.transactions = originalTransactions; server.submitTransaction = originalSubmit; }
  console.log('Health steps, thresholds, price isolation, ownership, stages, legacy roles and removal passed (offline).');
}
void main();

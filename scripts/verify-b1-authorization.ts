// Calls real route handlers. Only the Pollar verification HTTP response is substituted.
// Chain ownership/KYB reads and transaction construction remain real testnet calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Keypair, Networks, Operation, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { handle, type Action } from '../lib/server/loan/route';
import { server } from '../lib/server/loan/network';
import { attest } from '../lib/server/attestation';
import { a, balance, BOND, BOOK, i, inner, raw, validateSigned } from '../lib/server/loan/chain';
import { observeTransactions } from '../lib/server/loan/audit';
import { get, update } from '../lib/server/loan/store';
import { indexKey } from '../lib/server/loan/records';
import type { Index } from '../lib/server/loan/types';
const evidence = JSON.parse(readFileSync('scripts/evidence/c4-server.json', 'utf8'));
const owner = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update('rendaval-c4-company-v2').digest());
const attacker = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update('rendaval-c4-other-v1').digest());
const id = evidence.steps['repaid-accept'].contractId, bondId = evidence.steps['repaid-declare'].id;
const results: { test: string; status: number | string }[] = [];
const transactions: { label: string; hash: string }[] = existsSync('scripts/evidence/c4-authorization.json') ? JSON.parse(readFileSync('scripts/evidence/c4-authorization.json', 'utf8')).transactions ?? [] : [];
function save(completed = false) {
  writeFileSync('scripts/evidence/c4-authorization.json', JSON.stringify({ testedAt: new Date().toISOString(), mode: 'real chain; Pollar HTTP fixture only', completed, owner: owner.publicKey(), other: attacker.publicKey(), results, transactions }, null, 2) + '\n');
}
function record(label: string, hash: string) {
  if (!transactions.some(t => t.hash === hash)) transactions.push({ label, hash });
  save();
}
observeTransactions(record);
const originalFetch = globalThis.fetch;
let actor = attacker.publicKey();
globalThis.fetch = async (input, init) => {
  if (String(input) === 'https://server.api.pollar.xyz/v3/tokens/verify') {
    assert.equal(JSON.parse(String(init?.body)).token, 'test-fixture-token');
    return Response.json({ code: 'SERVER_TOKEN_VERIFIED', content: { network: 'testnet', wallet: { address: actor, network: 'STELLAR' } } });
  }
  return originalFetch(input, init);
};
async function route(action: Action, body: Record<string, unknown>, auth = true) {
  return handle(new Request('http://localhost/api/loan/' + action, { method: action === 'state' ? 'GET' : 'POST', headers: { ...(auth ? { Authorization: 'Bearer test-fixture-token' } : {}), 'Content-Type': 'application/json' }, ...(action === 'state' ? {} : { body: JSON.stringify(body) }) }), action);
}
async function main() {
  try { await server.loadAccount(attacker.publicKey()); } catch {
    const response = await originalFetch(`https://friendbot.stellar.org/?addr=${attacker.publicKey()}`); assert(response.ok); const funded = await response.json(); record('attacker-friendbot', funded.hash ?? funded.transaction_hash);
  }
  const attestation = await attest(attacker.publicKey(), 'c4-auth-negative');
  if ('txHash' in attestation) record('attacker-attestation', attestation.txHash);
  const targeted: Action[] = ['approve', 'accept', 'fund', 'price', 'default', 'liquidate', 'deposit/build', 'deposit/submit', 'open/build', 'open/submit', 'repay/topup', 'repay/build', 'repay/submit'];
  const all: Action[] = ['state', 'register', ...targeted, 'claim/build', 'claim/submit'];
  for (const action of all) {
    const r = await route(action, {}, false); assert.equal(r.status, 401, action); results.push({ test: action + ': missing token', status: r.status });
  }
  for (const action of targeted) {
    const r = await route(action, { contractId: id, bondId, wallet: owner.publicKey(), price: 0.65, signedXdr: 'invalid' });
    assert.equal(r.status, 403, action + ': ' + await r.text()); results.push({ test: action + ': foreign owner', status: r.status });
  }
  const ownState = await route('state', { wallet: owner.publicKey() }); assert.equal(ownState.status, 200, await ownState.clone().text());
  const ownStateBody = await ownState.json(); assert.equal(ownStateBody.wallet, attacker.publicKey()); assert.equal(ownStateBody.allLoans.length, 0); assert.equal(ownStateBody.bondRecords.length, 0);
  results.push({ test: 'state only lists Pollar wallet, ignores requested owner', status: 200 });
  // Even an operator-written incorrect index cannot grant ownership of a loan.
  actor = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update('rendaval-c4-poisoned-index-test').digest()).publicKey();
  try { await server.loadAccount(actor); } catch {
    const response = await originalFetch(`https://friendbot.stellar.org/?addr=${actor}`); assert(response.ok);
    const funded = await response.json(); record('poisoned-index-friendbot', funded.hash ?? funded.transaction_hash);
  }
  const poisonedAttestation = await attest(actor, 'c4-poisoned-index');
  if ('txHash' in poisonedAttestation) record('poisoned-index-attestation', poisonedAttestation.txHash);
  await update<Index>(indexKey(actor), old => old ?? ({ bonds: [], loans: [{ ref: 'poisoned-index-test', bondId, id }] }));
  const poisoned = await route('fund', { contractId: id });
  assert.equal(poisoned.status, 403, await poisoned.clone().text());
  results.push({ test: 'incorrect registry index still checked against book borrower', status: poisoned.status });
  const poisonedState = await route('state', {});
  assert.equal(poisonedState.status, 403, await poisonedState.clone().text());
  results.push({ test: 'state rejects a foreign loan even if indexed for the caller', status: poisonedState.status });
  actor = Keypair.random().publicKey();
  for (const action of all) {
    const r = await route(action, { contractId: id, bondId }); assert.equal(r.status, 403, action); results.push({ test: action + ': unverified', status: r.status });
  }
  actor = owner.publicKey();
  const challenge = await get<{ xdr: string }>(`sign:${owner.publicKey()}:${id}:deposit`); assert(challenge);
  const expected = inner(TransactionBuilder.fromXDR(challenge.xdr, Networks.TESTNET));
  expected.sign(owner);
  await validateSigned(expected.toXDR(), owner.publicKey(), expected);
  results.push({ test: 'exact company signature', status: 'accepted' });
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(attacker, '20000', expected, Networks.TESTNET); feeBump.sign(attacker);
  await validateSigned(feeBump.toXDR(), owner.publicKey(), expected);
  results.push({ test: 'fee bump preserves exact company transaction', status: 'accepted' });
  for (const [name, contract, method, args] of [
    ['wrong contract', BOOK, 'deposit', [i(1000000000n)]],
    ['wrong function', id, 'collect_bonds', []],
    ['wrong amount', id, 'deposit', [i(1n)]],
    ['wrong recipient', BOOK, 'claim', [a(attacker.publicKey())]],
  ] as const) {
    const tx = await raw(owner.publicKey(), contract, method, [...args]); tx.sign(owner);
    const r = await route('deposit/submit', { contractId: id, signedXdr: tx.toXDR() }); assert.equal(r.status, 400, name); results.push({ test: name, status: r.status });
  }
  const extra = TransactionBuilder.cloneFrom(expected).addOperation(Operation.manageData({ name: 'injected', value: 'bad' })).build(); extra.sign(owner);
  const extraResult = await route('deposit/submit', { contractId: id, signedXdr: extra.toXDR() }); assert.equal(extraResult.status, 400); results.push({ test: 'extra operation', status: extraResult.status });
  const wrongNetwork = TransactionBuilder.fromXDR(challenge.xdr, Networks.PUBLIC); wrongNetwork.sign(owner);
  const networkResult = await route('deposit/submit', { contractId: id, signedXdr: wrongNetwork.toXDR() }); assert.equal(networkResult.status, 400); results.push({ test: 'mainnet signature', status: networkResult.status });
  const openChallenge = await get<{ xdr: string }>(`sign:${owner.publicKey()}:${id}:open`); assert(openChallenge);
  const openTx = inner(TransactionBuilder.fromXDR(openChallenge.xdr, Networks.TESTNET));
  const op = openTx.operations[0]; assert.equal(op.type, 'invokeHostFunction');
  if (op.type === 'invokeHostFunction') {
    const auth = (op.auth ?? []).map(entry => xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR()));
    assert(auth.length > 0);
    auth[0].rootInvocation.subInvocations.push(xdr.SorobanAuthorizedInvocation.fromXDR(auth[0].rootInvocation.toXDR()));
    const injected = TransactionBuilder.cloneFrom(openTx).clearOperations().addOperation(Operation.invokeHostFunction({ func: op.func, auth })).build(); injected.sign(owner);
    const r = await route('open/submit', { contractId: id, signedXdr: injected.toXDR() }); assert.equal(r.status, 400); results.push({ test: 'injected nested Soroban authorization', status: r.status });
  }
  const unsigned = TransactionBuilder.fromXDR(challenge.xdr, Networks.TESTNET); assert(unsigned instanceof Transaction); unsigned.sign(attacker);
  const wrongSigner = await route('deposit/submit', { contractId: id, signedXdr: unsigned.toXDR() }); assert.equal(wrongSigner.status, 400); results.push({ test: 'wrong signature', status: wrongSigner.status });
  // Claim routes always bind the Pollar wallet and ignore a supplied recipient/contract.
  const claim = await route('claim/build', { contractId: id, recipient: attacker.publicKey(), wallet: attacker.publicKey() }); assert.equal(claim.status, 200, await claim.clone().text());
  const built = await claim.json();
  const foreign = await raw(owner.publicKey(), BOOK, 'claim', [a(attacker.publicKey())]); foreign.sign(owner);
  const rejected = await route('claim/submit', { signedXdr: foreign.toXDR() }); assert.equal(rejected.status, 400);
  assert(built.unsignedTransaction); results.push({ test: 'claim cannot redirect company credit', status: rejected.status });
  // Declaration rejects wallet/document injection before recording anything.
  const declaration = await route('register', { wallet: attacker.publicKey(), certificateFile: 'not permitted' }); assert.equal(declaration.status, 400); results.push({ test: 'document/wallet injection rejected', status: declaration.status });
  const before = await balance(BOND, owner.publicKey());
  for (const action of ['deposit', 'open', 'repay'] as const) {
    const saved = await get<{ xdr: string }>(`sign:${owner.publicKey()}:${id}:${action}`); assert(saved);
    const tx = TransactionBuilder.fromXDR(saved.xdr, Networks.TESTNET); tx.sign(owner);
    const replay = await route(`${action}/submit`, { contractId: id, signedXdr: tx.toXDR() }); assert.equal(replay.status, 200, await replay.text());
    results.push({ test: action + ': successful transaction replay after closure', status: replay.status });
  }
  assert.equal(await balance(BOND, owner.publicKey()), before);
  save(true);
  console.log(`${results.length} authorization checks passed`);
}
main().catch(error => { console.error(error instanceof Error ? error.stack : 'Failed'); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });

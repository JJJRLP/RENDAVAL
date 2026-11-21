// Testnet only. Keys never leave memory; evidence contains public data only.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Asset, Contract, Keypair, Networks, Operation,
  StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

const RPC = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC);
const asset = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
assert.equal(asset.contractId(Networks.TESTNET), USDC);
const key = name => { assert(process.env[name], `Missing ${name}`); return Keypair.fromSecret(process.env[name]); };
const vault = key('VAULT_SECRET_KEY');
const lender = key('LENDER_SECRET_KEY');
const issuer = key('BOND_ISSUER_SECRET_KEY');
const borrower = Keypair.random();
const buyer = Keypair.random();
const a = s => new Address(s).toScVal();
const i = n => nativeToScVal(BigInt(n), { type: 'i128' });
const u = n => nativeToScVal(n, { type: 'u32' });
const evidence = { network: 'testnet', sdk: '29.0.1', started: new Date().toISOString(), transactions: [],
  borrower: borrower.publicKey(), buyer: buyer.publicKey(), lender: lender.publicKey(), issuer: issuer.publicKey() };
const evidencePath = process.env.LOAN_BOOK_EVIDENCE;
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
function record(label, hash) {
  evidence.transactions.push({ label, hash }); console.log(`${label}: ${hash}`);
  if (evidencePath) writeFileSync(evidencePath, json(evidence) + '\n');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function submit(signer, operation, label, soroban = true) {
  const source = await server.getAccount(signer.publicKey());
  let tx = new TransactionBuilder(source, { fee: '10000', networkPassphrase: Networks.TESTNET })
    .addOperation(operation).setTimeout(180).build();
  if (soroban) tx = await server.prepareTransaction(tx);
  tx.sign(signer);
  const hash = Buffer.from(tx.hash()).toString('hex');
  // Submit once, poll that hash. Never rebuild a funds movement after an ambiguous response.
  try {
    const sent = await server.sendTransaction(tx);
    if (sent.status === 'ERROR') throw new Error(`Submission rejected: ${label} ${hash}`);
  } catch {
    console.log(`Checking submission outcome: ${label} ${hash}`);
  }
  for (let n = 0; n < 60; n++) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') { record(label, hash); return result.returnValue; }
    if (result.status === 'FAILED') throw new Error(`Transaction failed: ${label} ${hash}`);
    await sleep(2000);
  }
  throw new Error(`Unknown outcome; inspect hash before retrying: ${label} ${hash}`);
}
async function read(contract, method, args) {
  const source = await server.getAccount(vault.publicKey());
  const tx = new TransactionBuilder(source, { fee: '10000', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call(method, ...args)).setTimeout(60).build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation)) throw new Error(`Read failed: ${method}`);
  return scValToNative(simulation.result.retval);
}
async function verifyStorage(contractId, loanIds, wasmHash) {
  const contract = new Contract(contractId);
  const keys = [contract.getFootprint(), ...loanIds.map(id => xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({ contract: contract.address().toScAddress(),
      key: nativeToScVal(['Loan', id], { type: ['symbol', 'address'] }),
      durability: xdr.ContractDataDurability.persistent })
  ))];
  const result = await server.getLedgerEntries(...keys);
  assert.equal(result.entries.length, keys.length);
  const deployedHash = Buffer.from(result.entries[0].val.contractData.val.instance.executable.wasmHash.value).toString('hex');
  assert.equal(deployedHash, wasmHash);
  const ttls = result.entries.map(entry => entry.liveUntilLedgerSeq - result.latestLedger);
  assert(ttls.every(ttl => ttl > 60 * 17280), 'Storage lifetime too short');
  return { latestLedger: result.latestLedger, remainingLedgers: ttls, deployedWasmSha256: deployedHash };
}
let book;
const invoke = (signer, method, args, label = method) => submit(signer, new Contract(book).call(method, ...args), label);
const balance = who => read(USDC, 'balance', [a(who.publicKey())]);
let spent = 0n;
function reserve(n) { spent += n; assert(spent <= 300n * 10_000_000n, '300 USDC spending limit'); }
async function payment(from, to, units, label) {
  if (from === lender) reserve(units);
  const amount = `${units / 10_000_000n}.${(units % 10_000_000n).toString().padStart(7, '0')}`;
  await submit(from, Operation.payment({ destination: to.publicKey(), asset, amount }), label, false);
}
async function fresh(k, label) {
  const response = await fetch(`https://friendbot.stellar.org/?addr=${k.publicKey()}`);
  assert(response.ok, `Friendbot failed: ${label}`);
  const result = await response.json(); if (result.hash) record(`friendbot_${label}`, result.hash);
  await submit(k, Operation.changeTrust({ asset }), `trustline_${label}`, false);
}
let prepared = false;
try {
  evidence.protocol = (await server.getVersionInfo()).protocolVersion;
  assert(evidence.protocol >= 29, 'Protocol does not support SDK 29');
  // Calling balance confirms the supplied SAC exists and implements the token interface.
  const initial = await balance(lender); evidence.initialLenderUsdc = initial;
  assert(initial >= 156n * 10_000_000n, 'Insufficient demo funds');
  const wasm = readFileSync(new URL('../contracts/target/wasm32v1-none/release/rendaval_loan_book.wasm', import.meta.url));
  evidence.wasmSha256 = createHash('sha256').update(wasm).digest('hex');
  const hash = scValToNative(await submit(vault, Operation.uploadContractWasm({ wasm }), 'upload_wasm'));
  const deployed = await submit(vault, Operation.createCustomContract({
    address: new Address(vault.publicKey()), wasmHash: hash, salt: randomBytes(32),
    constructorArgs: [a(issuer.publicKey()), a(USDC), u(7000), u(8500)]
  }), 'deploy_initialize');
  book = scValToNative(deployed); evidence.contractId = book; console.log(`contract: ${book}`);
  await fresh(borrower, 'borrower'); await fresh(buyer, 'buyer'); prepared = true;
  const id1 = StrKey.encodeContract(randomBytes(32)), id2 = StrKey.encodeContract(randomBytes(32));
  evidence.loanIds = [id1, id2];
  const open = async (id, label) => {
    reserve(500_000_000n);
    await invoke(lender, 'open', [a(id), a(borrower.publicKey()), a(lender.publicKey()), i(1_000_000_000), i(500_000_000)], label);
  };
  await open(id1, 'open_liquidation_loan');
  await invoke(issuer, 'publish_price', [a(id1), i(6_500_000)], 'price_margin');
  await invoke(vault, 'flag_margin', [a(id1)]);
  await invoke(issuer, 'publish_price', [a(id1), i(5_500_000)], 'price_default');
  await invoke(vault, 'mark_default', [a(id1)]);
  await invoke(issuer, 'set_buyer', [a(buyer.publicKey()), nativeToScVal(true)], 'authorize_buyer');
  await payment(lender, buyer, 550_000_000n, 'fund_buyer');
  const before = { lender: await balance(lender), borrower: await balance(borrower) };
  await invoke(buyer, 'liquidate', [a(id1), a(buyer.publicKey()), i(5_500_000)]);
  const first = await read(book, 'get_loan', [a(id1)]);
  assert.equal(first.loan.status[0], 'Liquidated'); assert.equal(first.loan.loss, 0n);
  assert.equal(first.loan.surplus, 46_666_666n);
  assert.equal(await balance(lender), before.lender + first.debt);
  assert.equal(await balance(borrower), before.borrower + first.loan.surplus);
  await payment(borrower, lender, await balance(borrower), 'return_first_loan_funds');
  await open(id2, 'open_repayment_loan');
  const second = await read(book, 'get_loan', [a(id2)]);
  assert.equal(second.loan.price, 10_000_000n);
  await payment(lender, borrower, second.loan.interest, 'fund_demo_interest');
  // Only the borrower signs, as the transaction source. No separate auth-entry signature.
  await invoke(borrower, 'repay', [a(id2)]);
  const repaid = await read(book, 'get_loan', [a(id2)]);
  assert.equal(repaid.loan.status[0], 'Repaid');
  evidence.loans = [first, repaid]; evidence.grossLenderSpend = spent;
  evidence.storage = await verifyStorage(book, evidence.loanIds, evidence.wasmSha256);
  evidence.completed = true;
} finally {
  // Return recoverable USDC even if a later assertion or transaction fails.
  if (prepared) {
    for (const [who, label] of [[borrower, 'borrower'], [buyer, 'buyer']]) {
      const remaining = await balance(who);
      if (remaining > 0n) await payment(who, lender, remaining, `return_${label}_usdc`);
    }
    if (book) await invoke(issuer, 'set_buyer', [a(buyer.publicKey()), nativeToScVal(false)], 'revoke_demo_buyer');
    evidence.finalLenderUsdc = await balance(lender);
    if (evidence.completed) assert.equal(evidence.finalLenderUsdc, evidence.initialLenderUsdc);
  }
  if (evidencePath) writeFileSync(evidencePath, json(evidence) + '\n');
  console.log(json(evidence));
}

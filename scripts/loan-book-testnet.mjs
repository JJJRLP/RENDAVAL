// Testnet only. Keys never leave memory; evidence contains public data only.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Asset, Contract, Keypair, Networks, Operation,
  TransactionBuilder, authorizeEntry, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

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
const bondIssuer = Keypair.random();
const bondAsset = new Asset('A4BOND', bondIssuer.publicKey());
const bondToken = bondAsset.contractId(Networks.TESTNET);
const a = s => new Address(s).toScVal();
const i = n => nativeToScVal(BigInt(n), { type: 'i128' });
const sym = s => nativeToScVal(s, { type: 'symbol' });
const u = n => nativeToScVal(n, { type: 'u32' });
const evidence = { network: 'testnet', sdk: '29.0.1', started: new Date().toISOString(), transactions: [],
  bondIssuer: bondIssuer.publicKey(), bondToken, bondAsset: bondAsset.toString(),
  borrower: borrower.publicKey(), buyer: buyer.publicKey(), lender: lender.publicKey(), issuer: issuer.publicKey(), operator: vault.publicKey(), parameters: { maxStepBps: 2500, maxPriceAge: 86400, discountBps: 500 } };
const evidencePath = process.env.LOAN_BOOK_EVIDENCE;
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
function record(label, hash) {
  evidence.transactions.push({ label, hash }); console.log(`${label}: ${hash}`);
  if (evidencePath) writeFileSync(evidencePath, json(evidence) + '\n');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function submit(signer, operation, label, soroban = true) {
  evidence.lastAction = label;
  const source = await server.getAccount(signer.publicKey());
  let tx = new TransactionBuilder(source, { fee: '10000', networkPassphrase: Networks.TESTNET })
    .addOperation(operation).setTimeout(180).build();
  if (soroban) {
    const simulation = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulation)) throw new Error(`Simulation failed: ${label}: ${simulation.error}`);
    for (let j = 0; j < simulation.result.auth.length; j++) {
      const entry = simulation.result.auth[j];
      if (entry.credentials.type === 'sorobanCredentialsSourceAccount') continue;
      const address = Address.fromScAddress(entry.credentials.value.address).toString();
      assert.equal(address, vault.publicKey(), 'Unexpected non-source authorization');
      simulation.result.auth[j] = await authorizeEntry(entry, vault, simulation.latestLedger + 100, Networks.TESTNET);
    }
    if (label.startsWith('open_')) {
      const resources = simulation.transactionData.build().resources;
      (evidence.openResources ??= []).push({ label, minResourceFee: simulation.minResourceFee,
        instructions: resources.instructions, diskReadBytes: resources.diskReadBytes, writeBytes: resources.writeBytes,
        readOnlyEntries: resources.footprint.readOnly.length, readWriteEntries: resources.footprint.readWrite.length });
    }
    tx = rpc.assembleTransaction(tx, simulation).build();
  }
  tx.sign(signer);
  const hash = Buffer.from(tx.hash()).toString('hex');
  record(label, hash);
  // Submit once, poll that hash. Never rebuild a funds movement after an ambiguous response.
  try {
    const sent = await server.sendTransaction(tx);
    if (sent.status === 'ERROR') throw new Error(`Submission rejected: ${label} ${hash}`);
  } catch {
    console.log(`Checking submission outcome: ${label} ${hash}`);
  }
  for (let n = 0; n < 60; n++) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      Object.assign(evidence.transactions.find(t => t.hash === hash), { status: result.status, ledger: result.ledger });
      if (evidencePath) writeFileSync(evidencePath, json(evidence) + '\n');
      return result.returnValue;
    }
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
  assert(initial >= 204n * 10_000_000n, 'Insufficient demo funds');
  const wasm = readFileSync(new URL('../contracts/target/wasm32v1-none/release/rendaval_loan_book.wasm', import.meta.url));
  evidence.wasmSha256 = createHash('sha256').update(wasm).digest('hex');
  const hash = scValToNative(await submit(vault, Operation.uploadContractWasm({ wasm }), 'upload_wasm'));
  const deployed = await submit(vault, Operation.createCustomContract({
    address: new Address(vault.publicKey()), wasmHash: hash, salt: randomBytes(32),
    constructorArgs: [a(vault.publicKey()), a(issuer.publicKey()), a(USDC), u(7000), u(8500), u(2500), nativeToScVal(86400n, { type: 'u64' }), u(500)]
  }), 'deploy_initialize');
  book = scValToNative(deployed); evidence.contractId = book; console.log(`contract: ${book}`);
  await fresh(borrower, 'borrower'); await fresh(buyer, 'buyer'); prepared = true;
  await fresh(bondIssuer, 'bond_issuer');
  await submit(bondIssuer, Operation.setOptions({ setFlags: 1 | 2 | 8 }), 'bond_issuer_flags', false);
  await submit(vault, Operation.createStellarAssetContract({ asset: bondAsset }), 'deploy_bond_sac');
  // Existing live contracts stand in for escrows. Their code is never invoked.
  const id1 = book, id2 = USDC, id3 = bondToken;
  const escrow = async label => scValToNative(await submit(vault, Operation.createCustomContract({
    address: new Address(vault.publicKey()), wasmHash: hash, salt: randomBytes(32),
    constructorArgs: [a(vault.publicKey()), a(issuer.publicKey()), a(USDC), u(7000), u(8500), u(2500), nativeToScVal(86400n, { type: 'u64' }), u(500)]
  }), label));
  const id4 = await escrow('deploy_clawback_holder');
  const id5 = await escrow('deploy_freeze_holder');
  evidence.loanIds = [id1, id2, id3, id4, id5];
  const series = new Map([[id1, 'DEMO_LIQ'], [id2, 'DEMO_REPAY'], [id3, 'DEMO_CURE'], [id4, 'DEMO_CLAW'], [id5, 'DEMO_FREEZE']]);
  const bond = (method, args, label) => submit(bondIssuer, new Contract(bondToken).call(method, ...args), label);
  for (const [id, name] of series) {
    await bond('set_authorized', [a(id), nativeToScVal(true)], 'authorize_' + name);
    await bond('mint', [a(id), i(1_000_000_000)], 'deposit_' + name);
  }
  evidence.series = Object.fromEntries(series);
  for (const name of series.values()) await invoke(issuer, 'register_series', [sym(name), a(bondToken)], `register_${name}`);
  assert.equal((await read(book, 'assets', [])).length, 0);
  await invoke(issuer, 'list_series', [sym('DEMO_LIQ')], 'list_liquidation_series');
  assert.equal((await read(book, 'assets', [])).length, 1);
  const open = async (id, label, principal = 500_000_000n) => {
    reserve(principal);
    await invoke(lender, 'open', [a(id), sym(series.get(id)), a(borrower.publicKey()), a(lender.publicKey()), i(1_000_000_000), i(principal)], label);
  };
  await open(id1, 'open_liquidation_loan');
  await invoke(issuer, 'publish_price', [sym(series.get(id1)), i(8_000_000)], 'price_80');
  await invoke(issuer, 'publish_price', [sym(series.get(id1)), i(6_500_000)], 'price_margin');
  await invoke(vault, 'flag_margin', [a(id1)]);
  await invoke(issuer, 'publish_price', [sym(series.get(id1)), i(5_500_000)], 'price_default');
  await invoke(vault, 'mark_default', [a(id1)]);
  await invoke(issuer, 'set_buyer', [a(buyer.publicKey()), nativeToScVal(true)], 'authorize_buyer');
  await payment(lender, buyer, 522_500_000n, 'fund_buyer');
  const before = { lender: await balance(lender), borrower: await balance(borrower) };
  await invoke(buyer, 'liquidate', [a(id1), a(buyer.publicKey()), i(5_500_000)]);
  const first = await read(book, 'get_loan', [a(id1)]);
  const untouched = await read(book, 'lastprice', [nativeToScVal(['Other', series.get(id2)], { type: ['symbol', 'symbol'] })]);
  assert.equal(untouched.price, 10_000_000n);
  evidence.isolatedSeriesVerified = true;
  assert.equal(first.loan.status[0], 'Liquidated'); assert.equal(first.loan.loss, 0n);
  assert.equal(first.loan.surplus, 19_166_666n);
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
  await open(id3, 'open_cure_loan');
  for (const price of [8_000_000, 6_500_000, 5_000_000]) {
    await invoke(issuer, 'publish_price', [sym(series.get(id3)), i(price)], `cure_price_${price}`);
  }
  await invoke(vault, 'mark_default', [a(id3)], 'default_before_cure');
  const defaulted = await read(book, 'get_loan', [a(id3)]);
  assert.equal(defaulted.loan.status[0], 'Defaulted');
  await payment(lender, borrower, defaulted.loan.interest, 'fund_cure_interest');
  await invoke(borrower, 'repay', [a(id3)], 'cure');
  const cured = await read(book, 'get_loan', [a(id3)]);
  assert.equal(cured.loan.status[0], 'Repaid');
  await open(id4, 'open_clawback_loan');
  await bond('clawback', [a(id4), i(800_000_000)], 'clawback_collateral');
  const short = await read(book, 'get_loan', [a(id4)]);
  assert.equal(short.shortfall, 800_000_000n);
  assert.equal(short.value, 200_000_000n);
  await invoke(buyer, 'mark_default', [a(id4)], 'flag_clawback_default');
  const clawDefault = await read(book, 'get_loan', [a(id4)]);
  assert.equal(clawDefault.loan.status[0], 'Defaulted');
  await payment(lender, borrower, clawDefault.loan.interest, 'fund_clawback_interest');
  await invoke(borrower, 'repay', [a(id4)], 'repay_after_clawback');
  const clawRepaid = await read(book, 'get_loan', [a(id4)]);
  assert.equal(clawRepaid.loan.status[0], 'Repaid');
  assert.equal(clawRepaid.shortfall, 800_000_000n);
  assert.equal(clawRepaid.loan.surplus, 0n);
  await open(id5, 'open_freeze_loan', 10_000_000n);
  await bond('set_authorized', [a(id5), nativeToScVal(false)], 'freeze_collateral');
  await invoke(buyer, 'mark_default', [a(id5)], 'flag_freeze_default');
  const frozen = await read(book, 'get_loan', [a(id5)]);
  assert.equal(frozen.loan.status[0], 'Defaulted');
  assert.equal(frozen.loan.collateral.authorized, false);
  assert.equal(frozen.shortfall, 0n);
  await payment(lender, borrower, frozen.loan.interest, 'fund_freeze_interest');
  await invoke(borrower, 'repay', [a(id5)], 'repay_while_frozen');
  const freezeRepaid = await read(book, 'get_loan', [a(id5)]);
  assert.equal(freezeRepaid.loan.status[0], 'Repaid');
  evidence.collateralChecks = { short, clawDefault, clawRepaid, frozen, freezeRepaid };
  const oracleAsset = nativeToScVal(['Other', first.loan.asset], { type: ['symbol', 'symbol'] });
  const quote = await read(book, 'lastprice', [oracleAsset]);
  assert.equal(quote.price, first.loan.price);
  assert.equal(quote.timestamp, first.loan.price_time);
  evidence.oracleQuote = quote;
  evidence.loans = [first, repaid, cured, clawRepaid, freezeRepaid]; evidence.grossLenderSpend = spent;
  evidence.storage = await verifyStorage(book, evidence.loanIds, evidence.wasmSha256);
  evidence.completed = true;
} catch {
  console.log('Failed action:', evidence.lastAction);
  evidence.failure = 'Run failed; inspect the last public transaction hash. Do not blindly rerun.';
  process.exitCode = 1;
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

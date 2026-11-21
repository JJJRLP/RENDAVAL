// Testnet only. No secrets or signed envelopes are persisted. Final mode is resumable
// using fixed existing accounts and a journal of hashes, public salts and return values.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Asset, Contract, Keypair, Networks, Operation, StrKey, hash,
  TransactionBuilder, authorizeEntry, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
const final = process.argv.includes('--final');
assert(final || process.argv.includes('--throwaway'), 'Choose --throwaway or --final');
const path = final ? 'scripts/evidence/archive/c2/loan-book-testnet.json' : 'scripts/evidence/archive/c2/bond-rules-throwaway.json';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const horizon = 'https://horizon-testnet.stellar.org';
const networkPassphrase = Networks.TESTNET;
const key = n => Keypair.fromSecret(process.env[n]);
// The retired BOND_ISSUER_SECRET_KEY is never accessed.
const issuer = final ? key('NEW_BOND_ISSUER_SECRET_KEY') : Keypair.random();
const vault = final ? key('VAULT_SECRET_KEY') : Keypair.random();
const lender = final ? key('LENDER_SECRET_KEY') : Keypair.random();
const borrower = final ? vault : Keypair.random();
const outsider = final ? null : Keypair.random();
const bondAsset = new Asset(final ? 'RBOND' : 'C2BOND', issuer.publicKey());
const bond = bondAsset.contractId(networkPassphrase);
const usdAsset = final ? new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5') : new Asset('C2USD', issuer.publicKey());
const usd = usdAsset.contractId(networkPassphrase);
if (final) {
  assert.equal(issuer.publicKey(), 'GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6');
  assert.equal(process.env.NEW_BOND_CODE, 'RBOND');
  assert.equal(usd, 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
}
const a = s => new Address(s).toScVal();
const i = n => nativeToScVal(BigInt(n), { type: 'i128' });
const u = n => nativeToScVal(n, { type: 'u32' });
const sym = s => nativeToScVal(s, { type: 'symbol' });
const bool = n => nativeToScVal(n);
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
let evidence = { phase: 'C2', network: 'testnet', final, started: new Date().toISOString(),
  issuer: issuer.publicKey(), operator: vault.publicKey(), lender: lender.publicKey(), borrower: borrower.publicKey(),
  bondAsset: bondAsset.toString(), bondToken: bond, usdc: usd, transactions: [], checks: [], salts: {},
  parameters: { marginBps: 7000, defaultBps: 8500, maxStepBps: 2500, maxPriceAge: 86400, discountBps: 500, priceInterval: 30, gracePeriod: 30, curePeriod: 60 } };
if (existsSync(path)) {
  const old = JSON.parse(readFileSync(path));
  assert(final && old.phase === 'C2' && old.final, 'Existing evidence: do not overwrite or blindly repeat');
  assert(!old.completed, 'Final run already complete; use read-only verification');
  evidence = old;
  for (const [field, k] of [['issuer',issuer],['operator',vault],['lender',lender],['borrower',borrower]]) assert.equal(evidence[field], k.publicKey());
}
function save() {
  const data = json(evidence);
  assert(!/\bS[A-Z2-7]{55}\b/.test(data), 'Secret-shaped output rejected');
  writeFileSync(path, data + '\n');
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(hash) {
  for (let n=0;n<90;n++) { const r=await server.getTransaction(hash); if(r.status !== 'NOT_FOUND') return r; await pause(1500); }
  throw Error('Unknown outcome; inspect recorded hash, never rebuild blindly');
}
async function build(signer, op) {
  return new TransactionBuilder(await server.getAccount(signer.publicKey()), { fee:'10000', networkPassphrase }).addOperation(op).setTimeout(180).build();
}
async function submit(label, signer, op, soroban=true, expectFailure=false) {
  evidence.lastAction=label; save();
  let entry=evidence.transactions.find(t=>t.label===label);
  if (entry) {
    const r=await poll(entry.hash);
    assert.equal(r.status, expectFailure ? 'FAILED' : 'SUCCESS', label);
    entry.status=r.status; entry.ledger=r.ledger; save();
    return r.returnValue ? scValToNative(r.returnValue) : null;
  }
  let tx=await build(signer,op);
  if(soroban) {
    const sim=await server.simulateTransaction(tx);
    assert(rpc.Api.isSimulationSuccess(sim), `${label}: ${sim.error}`);
    for(let j=0;j<sim.result.auth.length;j++) {
      const auth=sim.result.auth[j];
      if(auth.credentials.type==='sorobanCredentialsSourceAccount') continue;
      const who=Address.fromScAddress(auth.credentials.value.address).toString();
      const k=[vault,lender,issuer,borrower].find(k=>k.publicKey()===who);
      assert(k,'Unexpected authorization');
      sim.result.auth[j]=await authorizeEntry(auth,k,sim.latestLedger+100,networkPassphrase);
    }
    if(label==='open') {
      const r=sim.transactionData.build().resources;
      evidence.openResources={instructions:r.instructions, diskReadBytes:r.diskReadBytes, writeBytes:r.writeBytes,
        readOnlyEntries:r.footprint.readOnly.length, readWriteEntries:r.footprint.readWrite.length, minResourceFee:sim.minResourceFee};
    }
    tx=rpc.assembleTransaction(tx,sim).build(); tx.sign(signer);
    const enforced=await server.simulateTransaction(tx,undefined,'enforce');
    assert(rpc.Api.isSimulationSuccess(enforced),`${label} auth: ${enforced.error}`);
  } else tx.sign(signer);
  entry={label,hash:Buffer.from(tx.hash()).toString('hex'),status:'PENDING'};
  evidence.transactions.push(entry); save(); console.log(label,entry.hash);
  const sent=await server.sendTransaction(tx);
  if(sent.status==='ERROR') {
    entry.status='SUBMISSION_REJECTED'; entry.resultXdr=sent.errorResult?.toXDR('base64'); save();
    assert(expectFailure,label+' submission rejected'); return null;
  }
  const result=await poll(entry.hash);
  entry.status=result.status; entry.ledger=result.ledger; entry.resultXdr=result.resultXdr?.toXDR('base64'); save();
  assert.equal(result.status,expectFailure?'FAILED':'SUCCESS',label);
  return result.returnValue ? scValToNative(result.returnValue) : null;
}
const invoke=(label,signer,id,method,args=[])=>submit(label,signer,new Contract(id).call(method,...args));
async function read(id,method,args=[]) {
  const sim=await server.simulateTransaction(await build(vault,new Contract(id).call(method,...args)));
  assert(rpc.Api.isSimulationSuccess(sim), `${method}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}
async function reject(label,signer,id,method,args=[],code) {
  let tx=await build(signer,new Contract(id).call(method,...args));
  let sim=await server.simulateTransaction(tx);
  let stage='SIMULATION_FAILED';
  if(rpc.Api.isSimulationSuccess(sim)) {
    tx=rpc.assembleTransaction(tx,sim).build(); tx.sign(signer);
    sim=await server.simulateTransaction(tx,undefined,'enforce'); stage='AUTH_SIMULATION_FAILED';
  }
  assert(!rpc.Api.isSimulationSuccess(sim),'Attack unexpectedly allowed: '+label);
  if(code) assert(sim.error.includes('Error(Contract, #'+code+')'), label+': '+sim.error);
  evidence.checks.push({label,status:stage,error:sim.error}); save(); console.log(label,stage);
}
async function account(who) { const r=await fetch(`${horizon}/accounts/${who}`); assert(r.ok); return r.json(); }
async function fund(k,label) {
  const r=await fetch('https://friendbot.stellar.org/?addr='+k.publicKey()); assert(r.ok,'Friendbot '+label);
  const data=await r.json(); evidence.transactions.push({label:'friendbot_'+label,hash:data.hash??data.transaction_hash,status:'SUCCESS'});save();
}
async function noTrustlines() {
  // Horizon includes empty, unauthorized trustlines in the accounts asset filter.
  const r=await fetch(`${horizon}/accounts?asset=${encodeURIComponent(bondAsset.toString())}&limit=1`);assert(r.ok);
  const data=await r.json(); assert.equal(data._embedded.records.length,0,'Bond already has a trustline');
  evidence.beforeImmutable={checkedAt:new Date().toISOString(), holders:0, flags:(await account(issuer.publicKey())).flags}; save();
}
function salt(label) { if(!evidence.salts[label]) { evidence.salts[label]=randomBytes(32).toString('hex'); save(); } return Buffer.from(evidence.salts[label],'hex'); }
function predicted(label) {
  const pre=xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
    networkId:hash(Buffer.from(networkPassphrase)), contractIdPreimage:xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({address:new Address(vault.publicKey()).toScAddress(),salt:salt(label)})) }));
  return StrKey.encodeContract(hash(pre.toXdr()));
}
async function deploy(label,file,args) {
  const wasm=readFileSync(`contracts/target/wasm32v1-none/release/${file}.wasm`);
  const sha=createHash('sha256').update(wasm).digest();
  (evidence.wasm??={})[label]={sha256:sha.toString('hex'),bytes:wasm.length}; save();
  await submit('upload_'+label,vault,Operation.uploadContractWasm({wasm}));
  const id=await submit('deploy_'+label,vault,Operation.createCustomContract({address:new Address(vault.publicKey()),wasmHash:sha,salt:salt(label),constructorArgs:args}));
  assert.equal(id,predicted(label)); return id;
}
async function transfer(label,from,to,amount) {
  assert(amount>0n);
  await invoke(label,from,usd,'transfer',[a(from.publicKey()),a(to.publicKey()),i(amount)]);
}
const unit=10_000_000n;
const decimal=n=>`${n/unit}.${(n%unit).toString().padStart(7,'0')}`;
async function limit(label,k,value) {
  await submit(label,k,Operation.changeTrust({asset:usdAsset,limit:value}),false);
}
async function waitUntil(timestamp) {
  for (;;) {
    const latest=await server.getLatestLedger();
    const now=Number(latest.closeTime);
    if(now>=Number(timestamp)) return;
    await pause(3000);
  }
}
async function main() {
  assert.equal((await server.getNetwork()).passphrase,networkPassphrase);
  if(!final) {
    for(const [name,k] of [['issuer',issuer],['operator',vault],['lender',lender],['borrower',borrower]]) await fund(k,name);
    await submit('initial_flags',issuer,Operation.setOptions({setFlags:3}),false);
    await submit('create_usd_sac',issuer,Operation.createStellarAssetContract({asset:usdAsset}));
    await noTrustlines();
    await submit('immutable_flags',issuer,Operation.setOptions({setFlags:4}),false);
  } else if(!evidence.beforeImmutable) {
    await noTrustlines();
    const issuerAccount=await account(issuer.publicKey());
    const trustlines=issuerAccount.balances.filter(x=>x.asset_type!=='native');
    assert.equal(trustlines.length,0,'Issuer itself must have no trustlines');
    evidence.issuerTrustlinesBefore=trustlines;save();
  }
  const flags=(await account(issuer.publicKey())).flags;
  assert(flags.auth_required && flags.auth_revocable && flags.auth_immutable && !flags.auth_clawback_enabled);
  evidence.immutableFlags=flags;save();
  await submit('create_bond_sac',issuer,Operation.createStellarAssetContract({asset:bondAsset}));
  const rules=predicted('rules'),book=predicted('book');
  evidence.rulesContractId=rules;evidence.contractId=book;save();
  await deploy('rules','rendaval_bond_rules',[a(issuer.publicKey()),a(book),a(vault.publicKey())]);
  await deploy('book','rendaval_loan_book',[a(vault.publicKey()),a(issuer.publicKey()),a(usd),a(rules),u(7000),u(8500),u(2500),nativeToScVal(86400n,{type:'u64'}),u(500),u(30),nativeToScVal(30n,{type:'u64'}),nativeToScVal(60n,{type:'u64'})]);
  evidence.rulesConfig=await read(rules,'get_config');evidence.bookConfig=await read(book,'get_config');
  assert.equal(evidence.rulesConfig.book,book);assert.equal(evidence.bookConfig.rules,rules);save();
  await invoke('handover_admin',issuer,bond,'set_admin',[a(rules)]);
  assert.equal(await read(bond,'admin'),rules);
  const escrow=await deploy('escrow','rendaval_test_escrow',[a(borrower.publicKey())]);
  const escrow2=await deploy('escrow2','rendaval_test_escrow',[a(borrower.publicKey())]);
  evidence.escrow=escrow;evidence.escrow2=escrow2;save();
  for(const [name,k] of [['borrower',borrower],['lender',lender]]) {
    await submit(name+'_bond_trustline',k,Operation.changeTrust({asset:bondAsset}),false);
    await invoke('approve_'+name,issuer,rules,'set_authorized',[a(bond),a(k.publicKey()),bool(true)]);
    if(!final) {
      await submit(name+'_usd_trustline',k,Operation.changeTrust({asset:usdAsset}),false);
      await invoke(name+'_usd_approve',issuer,usd,'set_authorized',[a(k.publicKey()),bool(true)]);
    }
  }
  if(!final) {
    await invoke('book_usd_approve',issuer,usd,'set_authorized',[a(book),bool(true)]);
    await submit('fund_disposable_lender',issuer,Operation.payment({destination:lender.publicKey(),asset:usdAsset,amount:'300'}),false);
  }
  if(!evidence.initial) {
    evidence.initial={};
    for(const [name,k] of [['lender',lender],['borrower',borrower]]) {
      const line=(await account(k.publicKey())).balances.find(b=>b.asset_code===usdAsset.code&&b.asset_issuer===usdAsset.issuer);
      assert(line && Number(line.buying_liabilities)===0 && Number(line.selling_liabilities)===0);
      evidence.initial[name]={balance:await read(usd,'balance',[a(k.publicKey())]),limit:line.limit};
    }
    save();
  }
  for(const [name,id] of [['one',escrow],['two',escrow2]]) await invoke('approve_escrow_'+name,issuer,rules,'set_authorized',[a(bond),a(id),bool(true)]);
  await submit('issue_200_bonds',issuer,Operation.payment({destination:borrower.publicKey(),asset:bondAsset,amount:'200'}),false);
  for(const [name,id] of [['one',escrow],['two',escrow2]]) await invoke('deposit_'+name,borrower,bond,'transfer',[a(borrower.publicKey()),a(id),i(100n*unit)]);
  await invoke('register_series',issuer,book,'register_series',[sym('C2_DEMO'),a(bond)]);
  assert.equal((await read(book,'get_series',[sym('C2_DEMO')])).quote.price,0n);
  await invoke('initial_price',issuer,book,'publish_price',[sym('C2_DEMO'),i(unit)]);
  const principal=50n*unit,interest=(principal+149n)/150n;
  evidence.grossLenderSpend=2n*principal+interest+100n*unit;assert(evidence.grossLenderSpend<=300n*unit);save();
  const openArgs=id=>[a(id),sym('C2_DEMO'),a(borrower.publicKey()),a(lender.publicKey()),i(100n*unit),i(principal)];
  await invoke('open',borrower,book,'open',openArgs(escrow));
  evidence.opened=await read(book,'get_loan',[a(escrow)]);
  assert.equal(Number(await read(rules,'live_pledges')),1);
  await reject('issuer_freeze_pledged',issuer,rules,'set_authorized',[a(bond),a(escrow),bool(false)],101);
  await reject('replacement_while_pledged',issuer,rules,'replace_book',[a(escrow2)],101);
  await transfer('fund_demo_interest',lender,borrower,interest);
  if(!evidence.lenderCap) { evidence.lenderCap=decimal(await read(usd,'balance',[a(lender.publicKey())]));save(); }
  await limit('cap_lender_trustline',lender,evidence.lenderCap);
  await invoke('repay_blocked_recipient',borrower,book,'repay',[a(escrow)]);
  evidence.repaid=await read(book,'get_loan',[a(escrow)]);
  assert.equal(evidence.repaid.loan.status[0],'Repaid');
  evidence.lenderCredit=await read(book,'claimable',[a(lender.publicKey())]);assert.equal(evidence.lenderCredit,principal+interest);save();
  await reject('claim_lender_still_blocked',lender,book,'claim',[a(lender.publicKey())],16);
  await limit('restore_lender_trustline',lender,evidence.initial.lender.limit);
  await invoke('lender_claim',lender,book,'claim',[a(lender.publicKey())]);
  await invoke('return_one',borrower,escrow,'withdraw',[a(bond)]);
  await invoke('lift_one',vault,book,'release_pledge',[a(escrow)]);
  // The company is source again; operator and lender authorize the exact open invocation.
  await invoke('open_two',borrower,book,'open',openArgs(escrow2));
  await invoke('approve_buyer',issuer,book,'set_buyer',[a(lender.publicKey()),bool(true)]);
  for(const [label,p] of [['price_75',7_500_000n],['price_5625',5_625_000n]]) {
    if(!evidence.transactions.some(t=>t.label===label)) {
      const series=await read(book,'get_series',[sym('C2_DEMO')]);
      await waitUntil(BigInt(series.changed_at)+30n);
    }
    await invoke(label,issuer,book,'publish_price',[sym('C2_DEMO'),i(p)]);
  }
  await invoke('mark_default',vault,book,'mark_default',[a(escrow2)]);
  evidence.defaulted=await read(book,'get_loan',[a(escrow2)]);save();
  if(!evidence.checks.some(x=>x.label==='cure_window')) await reject('cure_window',lender,book,'liquidate',[a(escrow2),a(lender.publicKey()),i(5_625_000n)],18);
  if(!evidence.borrowerCap) { evidence.borrowerCap=decimal(await read(usd,'balance',[a(borrower.publicKey())]));save(); }
  await limit('cap_borrower_trustline',borrower,evidence.borrowerCap);
  await waitUntil(BigInt(evidence.defaulted.loan.defaulted_at)+60n);
  await invoke('liquidate_blocked_surplus',lender,book,'liquidate',[a(escrow2),a(lender.publicKey()),i(5_625_000n)]);
  evidence.liquidated=await read(book,'get_loan',[a(escrow2)]);
  assert.equal(evidence.liquidated.loan.status[0],'Liquidated');
  evidence.borrowerCredit=await read(book,'claimable',[a(borrower.publicKey())]);assert(evidence.borrowerCredit>0n);save();
  await reject('claim_borrower_still_blocked',borrower,book,'claim',[a(borrower.publicKey())],16);
  await limit('restore_borrower_trustline',borrower,evidence.initial.borrower.limit);
  await invoke('borrower_claim',borrower,book,'claim',[a(borrower.publicKey())]);
  await invoke('return_two',borrower,escrow2,'withdraw',[a(bond)]);
  await invoke('deliver_buyer_bonds',borrower,bond,'transfer',[a(borrower.publicKey()),a(lender.publicKey()),i(100n*unit)]);
  await invoke('lift_two',vault,book,'release_pledge',[a(escrow2)]);
  await transfer('return_demo_usdc',borrower,lender,principal+BigInt(evidence.borrowerCredit));
  for(const [name,k] of [['borrower',borrower],['lender',lender]]) await submit('retire_'+name+'_bonds',k,Operation.payment({destination:issuer.publicKey(),asset:bondAsset,amount:'100'}),false);
  evidence.finalState={admin:await read(bond,'admin'),livePledges:await read(rules,'live_pledges'),bookUsdc:await read(usd,'balance',[a(book)])};
  assert.equal(evidence.finalState.admin,rules);assert.equal(Number(evidence.finalState.livePledges),0);assert.equal(evidence.finalState.bookUsdc,0n);
  for(const [name,k] of [['lender',lender],['borrower',borrower]]) {
    evidence.finalState[name]=await read(usd,'balance',[a(k.publicKey())]);
    assert.equal(evidence.finalState[name],BigInt(evidence.initial[name].balance));
    assert.equal(await read(book,'claimable',[a(k.publicKey())]),0n);
  }
  evidence.grossLenderSpend=2n*principal+interest+BigInt(evidence.liquidated.loan.proceeds);
  assert(evidence.grossLenderSpend<=300n*unit);
  evidence.completed=new Date().toISOString();save();console.log('C2 verified, balances restored');
}
main().catch(e=>{ console.error(e.message);process.exitCode=1; });

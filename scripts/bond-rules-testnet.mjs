// Testnet only. No secrets or signed envelopes are persisted. Final mode is resumable
// using fixed existing accounts and a journal of hashes, public salts and return values.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Asset, Contract, Keypair, Networks, Operation, StrKey, hash,
  TransactionBuilder, authorizeEntry, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
const final = process.argv.includes('--final');
assert(final || process.argv.includes('--throwaway'), 'Choose --throwaway or --final');
const path = final ? 'scripts/evidence/loan-book-testnet.json' : 'scripts/evidence/bond-rules-throwaway.json';
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
const bondAsset = new Asset(final ? 'RVBOND' : 'C1BOND', issuer.publicKey());
const bond = bondAsset.contractId(networkPassphrase);
const usdAsset = final ? new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5') : new Asset('C1USD', issuer.publicKey());
const usd = usdAsset.contractId(networkPassphrase);
if (final) {
  assert.equal(issuer.publicKey(), 'GBDNNFSL6OJOLEXNGAQ6IKF4CSF4GT742SQCQMM7ETASVZ3SR33XRKA6');
  assert.equal(bond, 'CDPPMX5DG2XQUNQFYKIB77OZVZJWAHRDEOLHOCRBJ2UK4MGBNHQUGZGW');
  assert.equal(process.env.NEW_BOND_CODE, 'RVBOND');
  assert.equal(usd, 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
}
const a = s => new Address(s).toScVal();
const i = n => nativeToScVal(BigInt(n), { type: 'i128' });
const u = n => nativeToScVal(n, { type: 'u32' });
const sym = s => nativeToScVal(s, { type: 'symbol' });
const bool = n => nativeToScVal(n);
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
let evidence = { phase: 'C1', network: 'testnet', final, started: new Date().toISOString(),
  issuer: issuer.publicKey(), operator: vault.publicKey(), lender: lender.publicKey(), borrower: borrower.publicKey(),
  bondAsset: bondAsset.toString(), bondToken: bond, usdc: usd, transactions: [], checks: [], salts: {},
  parameters: { marginBps: 7000, defaultBps: 8500, maxStepBps: 2500, maxPriceAge: 86400, discountBps: 500 } };
if (existsSync(path)) {
  const old = JSON.parse(readFileSync(path));
  assert(final && old.phase === 'C1' && old.final, 'Existing evidence: do not overwrite or blindly repeat');
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
      assert.equal(who,vault.publicKey(),'Unexpected authorization');
      sim.result.auth[j]=await authorizeEntry(auth,vault,sim.latestLedger+100,networkPassphrase);
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
async function reject(label,signer,id,method,args=[]) {
  let tx=await build(signer,new Contract(id).call(method,...args));
  let sim=await server.simulateTransaction(tx);
  let stage='SIMULATION_FAILED';
  if(rpc.Api.isSimulationSuccess(sim)) {
    tx=rpc.assembleTransaction(tx,sim).build(); tx.sign(signer);
    sim=await server.simulateTransaction(tx,undefined,'enforce'); stage='AUTH_SIMULATION_FAILED';
  }
  assert(!rpc.Api.isSimulationSuccess(sim),'Attack unexpectedly allowed: '+label);
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
async function main() {
  assert.equal((await server.getNetwork()).passphrase,networkPassphrase);
  if(!final) {
    for(const [name,k] of [['issuer',issuer],['operator',vault],['lender',lender],['borrower',borrower],['outsider',outsider]]) await fund(k,name);
    await submit('initial_flags',issuer,Operation.setOptions({setFlags:3}),false);
    await submit('create_bond_sac',issuer,Operation.createStellarAssetContract({asset:bondAsset}));
    await submit('create_usd_sac',issuer,Operation.createStellarAssetContract({asset:usdAsset}));
  }
  if(!evidence.transactions.some(t=>t.label==='immutable_flags')) {
    await noTrustlines();
    const flags=evidence.beforeImmutable.flags;
    assert(flags.auth_required && flags.auth_revocable && !flags.auth_clawback_enabled && !flags.auth_immutable);
  }
  await submit('immutable_flags',issuer,Operation.setOptions({setFlags:4}),false);
  const flags=(await account(issuer.publicKey())).flags;
  assert(flags.auth_required && flags.auth_revocable && flags.auth_immutable && !flags.auth_clawback_enabled);
  evidence.immutableFlags=flags;save();
  const rules=predicted('rules'),book=predicted('book');
  evidence.rulesContractId=rules;evidence.contractId=book;save();
  await deploy('rules','rendaval_bond_rules',[a(issuer.publicKey()),a(book)]);
  await deploy('book','rendaval_loan_book',[a(vault.publicKey()),a(issuer.publicKey()),a(usd),a(rules),u(7000),u(8500),u(2500),nativeToScVal(86400n,{type:'u64'}),u(500)]);
  assert.equal((await read(rules,'get_config')).book,book);
  assert.equal((await read(book,'get_config')).rules,rules);
  await invoke('handover_admin',issuer,bond,'set_admin',[a(rules)]);
  assert.equal(await read(bond,'admin'),rules);
  evidence.adminVerified=rules;save();
  const escrow=await deploy('escrow','rendaval_test_escrow',[a(borrower.publicKey())]);
  evidence.escrow=escrow;save();
  await submit('borrower_bond_trustline',borrower,Operation.changeTrust({asset:bondAsset}),false);
  await invoke('approve_borrower',issuer,rules,'set_authorized',[a(bond),a(borrower.publicKey()),bool(true)]);
  await invoke('authorize_escrow',issuer,rules,'set_authorized',[a(bond),a(escrow),bool(true)]);
  await submit('issue_100_bonds',issuer,Operation.payment({destination:borrower.publicKey(),asset:bondAsset,amount:'100'}),false);
  if(!final) {
    for(const [name,k] of [['borrower',borrower],['lender',lender]]) {
      await submit(name+'_usd_trustline',k,Operation.changeTrust({asset:usdAsset}),false);
      await invoke(name+'_usd_approve',issuer,usd,'set_authorized',[a(k.publicKey()),bool(true)]);
    }
    await submit('fund_disposable_lender',issuer,Operation.payment({destination:lender.publicKey(),asset:usdAsset,amount:'100'}),false);
    // Account and ordinary contract revocation, then approval, after immutable flags.
    for(const [label,holder] of [['account',borrower.publicKey()],['contract',escrow]]) {
      await invoke('revoke_ordinary_'+label,issuer,rules,'set_authorized',[a(bond),a(holder),bool(false)]);
      assert.equal(await read(bond,'authorized',[a(holder)]),false);
      await invoke('approve_ordinary_'+label,issuer,rules,'set_authorized',[a(bond),a(holder),bool(true)]);
    }
  }
  if(!evidence.initialLenderUsdc) {
    evidence.initialLenderUsdc=await read(usd,'balance',[a(lender.publicKey())]);
    evidence.initialBorrowerUsdc=await read(usd,'balance',[a(borrower.publicKey())]);save();
  }
  await invoke('deposit_collateral',borrower,bond,'transfer',[a(borrower.publicKey()),a(escrow),i(1_000_000_000)]);
  await invoke('register_series',issuer,book,'register_series',[sym('C1_DEMO'),a(bond)]);
  const principal=500_000_000n,interest=(principal+149n)/150n;
  evidence.grossLenderSpend=principal+interest; assert(evidence.grossLenderSpend<=300n*10_000_000n);save();
  await invoke('open',lender,book,'open',[a(escrow),sym('C1_DEMO'),a(borrower.publicKey()),a(lender.publicKey()),i(1_000_000_000),i(principal)]);
  evidence.opened=await read(book,'get_loan',[a(escrow)]);
  assert.equal(await read(rules,'pledged',[a(bond),a(escrow)]),true);
  await reject('issuer_freeze_pledged',issuer,rules,'set_authorized',[a(bond),a(escrow),bool(false)]);
  if(!final) {
    for(const [label,k] of [['operator',vault],['outsider',outsider],['issuer',issuer]]) {
      await reject(label+'_release_direct',k,rules,'release',[a(bond),a(escrow)]);
      await reject(label+'_protect_direct',k,rules,'protect',[a(bond),a(escrow)]);
      await reject(label+'_release_live',k,book,'release_pledge',[a(escrow)]);
      await reject(label+'_freeze',k,rules,'set_authorized',[a(bond),a(escrow),bool(false)]);
    }
    for(const [method,args] of [
      ['set_authorized',[a(escrow),bool(false)]],['clawback',[a(escrow),i(1)]],['set_admin',[a(issuer.publicKey())]],
      ['mint',[a(escrow),i(1)]],['transfer',[a(escrow),a(borrower.publicKey()),i(1)]],['burn',[a(escrow),i(1)]],
      ['transfer_from',[a(issuer.publicKey()),a(escrow),a(borrower.publicKey()),i(1)]],['burn_from',[a(issuer.publicKey()),a(escrow),i(1)]]
    ]) await reject('issuer_direct_'+method,issuer,bond,method,args);
    for(const method of ['clawback','set_admin','upgrade','pause','__constructor'])
      await reject('rules_no_'+method,issuer,rules,method,[a(issuer.publicKey())]);
    for(const [label,fn] of [
      ['classic_setTrustLineFlags_contract',()=>Operation.setTrustLineFlags({trustor:escrow,asset:bondAsset,flags:{authorized:false}})],
      ['classic_allowTrust_contract',()=>Operation.allowTrust({trustor:escrow,assetCode:bondAsset.code,authorize:false})],
      ['classic_clawback_contract',()=>Operation.clawback({from:escrow,asset:bondAsset,amount:'1'})]
    ]) { let failed=false;try{fn();}catch{failed=true;} assert(failed,label); evidence.checks.push({label,status:'SDK_REJECTED'}); save(); }
    await submit('cannot_enable_clawback',issuer,Operation.setOptions({setFlags:8}),false,true);
    await submit('cannot_clear_required',issuer,Operation.setOptions({clearFlags:1}),false,true);
    await submit('cannot_clear_revocable',issuer,Operation.setOptions({clearFlags:2}),false,true);
    let sim=await server.simulateTransaction(await build(issuer,Operation.createStellarAssetContract({asset:bondAsset})));
    assert(!rpc.Api.isSimulationSuccess(sim));evidence.checks.push({label:'recreate_sac',status:'SIMULATION_FAILED',error:sim.error});save();
    assert.equal(await read(bond,'balance',[a(escrow)]),1_000_000_000n);
    assert.equal(await read(bond,'authorized',[a(escrow)]),true);
  }
  await transfer('fund_demo_interest',lender,borrower,interest);
  await invoke('repay',borrower,book,'repay',[a(escrow)]);
  evidence.repaid=await read(book,'get_loan',[a(escrow)]);assert.equal(evidence.repaid.loan.status[0],'Repaid');save();
  await reject('release_repaid_but_nonempty',vault,book,'release_pledge',[a(escrow)]);
  assert.equal(await read(rules,'pledged',[a(bond),a(escrow)]),true);
  await invoke('return_collateral',borrower,escrow,'withdraw',[a(bond)]);
  assert.equal(await read(bond,'balance',[a(escrow)]),0n);
  await invoke('lift_pledge',vault,book,'release_pledge',[a(escrow)]);
  await invoke('lift_pledge_retry',vault,book,'release_pledge',[a(escrow)]);
  assert.equal(await read(rules,'pledged',[a(bond),a(escrow)]),false);
  if(!final) await invoke('revoke_after_release',issuer,rules,'set_authorized',[a(bond),a(escrow),bool(false)]);
  // Return issued demo bonds to the issuer; classic transfer is authorized by their holder.
  await submit('return_demo_bonds',borrower,Operation.payment({destination:issuer.publicKey(),asset:bondAsset,amount:'100'}),false);
  evidence.finalLenderUsdc=await read(usd,'balance',[a(lender.publicKey())]);
  evidence.finalBorrowerUsdc=await read(usd,'balance',[a(borrower.publicKey())]);
  assert.equal(evidence.finalLenderUsdc.toString(),evidence.initialLenderUsdc.toString());
  assert.equal(evidence.finalBorrowerUsdc.toString(),evidence.initialBorrowerUsdc.toString());
  evidence.finalPledged=await read(rules,'pledged',[a(bond),a(escrow)]);
  evidence.finalEscrowBalance=await read(bond,'balance',[a(escrow)]);
  evidence.finalAdmin=await read(bond,'admin');
  evidence.completed=true;evidence.finished=new Date().toISOString();save();console.log('Completed',path);
}
main().catch(error=>{evidence.failure=String(error.message).replace(/\bS[A-Z2-7]{55}\b/g,'[REDACTED]');save();console.error(evidence.lastAction,evidence.failure);process.exitCode=1;});

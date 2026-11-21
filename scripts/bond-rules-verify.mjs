// Read-only verification. No environment keys, signatures or transactions.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Contract, Networks, StrKey, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';
const input=process.argv[2]??'scripts/evidence/archive/c2/loan-book-testnet.json';
const output=input.replace(/\.json$/, '-verification.json');
const e=JSON.parse(readFileSync(input));assert.equal(e.phase,'C2');assert(e.completed);
const r=new rpc.Server('https://soroban-testnet.stellar.org');
const a=s=>new Address(s).toScVal();
async function read(id,method,args=[]) {
  const tx=new TransactionBuilder(await r.getAccount(e.operator),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();
  const sim=await r.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(sim),sim.error);return scValToNative(sim.result.retval);
}
const result={network:'testnet',verifiedAt:new Date().toISOString(),contractId:e.contractId,rulesContractId:e.rulesContractId,
  bondToken:e.bondToken,escrow:e.escrow,transactions:[],wasm:{}};
assert.equal((await r.getNetwork()).passphrase,Networks.TESTNET);
for(let start=0;start<e.transactions.length;start+=4) {
  const batch=await Promise.all(e.transactions.slice(start,start+4).map(async t=>{
    const response=await fetch(`https://horizon-testnet.stellar.org/transactions/${t.hash}`);
    assert(response.ok,`${t.label}: Horizon ${response.status}`);const h=await response.json();
    assert.equal(h.successful,t.status==='SUCCESS',t.label);
    return {label:t.label,hash:t.hash,ledger:h.ledger,successful:h.successful};
  }));result.transactions.push(...batch);
}
for(const [name,id,file] of [['rules',e.rulesContractId,'rendaval_bond_rules'],['book',e.contractId,'rendaval_loan_book'],['escrow',e.escrow,'rendaval_test_escrow'],['escrow2',e.escrow2,'rendaval_test_escrow']]) {
  const entry=(await r.getLedgerEntries(new Contract(id).getFootprint())).entries[0];assert(entry);
  const executable=entry.val.contractData.val.instance.executable;
  const deployed=Buffer.from(executable.wasmHash.value).toString('hex');
  const local=createHash('sha256').update(readFileSync(`contracts/target/wasm32v1-none/release/${file}.wasm`)).digest('hex');
  assert.equal(deployed,local);assert.equal(deployed,e.wasm[name].sha256);
  result.wasm[name]={contractId:id,sha256:deployed,liveUntilLedgerSeq:entry.liveUntilLedgerSeq};
}
const sac=(await r.getLedgerEntries(new Contract(e.bondToken).getFootprint())).entries[0];
assert.equal(sac.val.contractData.val.instance.executable.type,'contractExecutableStellarAsset');
result.sacExecutable=sac.val.contractData.val.instance.executable.type;
const response=await fetch(`https://horizon-testnet.stellar.org/accounts/${e.issuer}`);assert(response.ok);
result.flags=(await response.json()).flags;
assert.deepEqual(result.flags,{auth_required:true,auth_revocable:true,auth_immutable:true,auth_clawback_enabled:false});
result.admin=await read(e.bondToken,'admin');assert.equal(result.admin,e.rulesContractId);
result.rulesConfig=await read(e.rulesContractId,'get_config');assert.equal(result.rulesConfig.issuer,e.issuer);assert.equal(result.rulesConfig.book,e.contractId);
result.bookConfig=await read(e.contractId,'get_config');
for(const [field,value] of Object.entries({rules:e.rulesContractId,issuer:e.issuer,operator:e.operator,usdc:e.usdc,margin_bps:7000,default_bps:8500,max_step_bps:2500,discount_bps:500,price_interval:30}))assert.equal(result.bookConfig[field],value);
assert.equal(result.bookConfig.max_price_age,86400n);
assert.equal(result.bookConfig.grace_period,30n);
assert.equal(result.bookConfig.cure_period,60n);
assert.equal(result.rulesConfig.operator,e.operator);
result.loans={};
for(const [id,status] of [[e.escrow,'Repaid'],[e.escrow2,'Liquidated']]) {
  const loan=await read(e.contractId,'get_loan',[a(id)]);assert.equal(loan.loan.status[0],status);
  result.loans[id]=loan;
  assert.equal(await read(e.rulesContractId,'pledged',[a(e.bondToken),a(id)]),false);
  assert.equal(await read(e.bondToken,'balance',[a(id)]),0n);
}
assert.equal(await read(e.rulesContractId,'live_pledges'),0n);
assert.equal(await read(e.usdc,'balance',[a(e.contractId)]),0n);
result.balances={};
for(const name of ['lender','borrower']) {
  result.balances[name]=await read(e.usdc,'balance',[a(e[name])]);
  if(e.reconciliation) {
    assert.equal(e.reconciliation.net[name].own,'0');
    assert.equal(BigInt(e.finalState[name]),BigInt(e.initial[name].balance)+BigInt(e.reconciliation.net[name].external));
  } else assert.equal(result.balances[name].toString(),e.initial[name].balance);
  assert.equal(await read(e.contractId,'claimable',[a(e[name])]),0n);
  const acc=await fetch(`https://horizon-testnet.stellar.org/accounts/${e[name]}`);assert(acc.ok);
  const usd=(await acc.json()).balances.find(b=>b.asset_code===(e.bondAsset.startsWith('RBOND:')?'USDC':'C2USD'));
  assert.equal(usd.limit,e.initial[name].limit);
}
if(e.reconciliation) {
  const reconciliation=JSON.parse(readFileSync('scripts/evidence/'+e.reconciliation.file));
  const verified=new Map();
  for(const movement of reconciliation.movements) {
    if(!verified.has(movement.hash)) {
      const tx=await r.getTransaction(movement.hash);assert.equal(tx.status,'SUCCESS');
      verified.set(movement.hash,[...(tx.events.contractEventsXdr??[]).flat(),...(tx.events.transactionEventsXdr??[]).map(x=>x.event)]);
    }
    assert(verified.get(movement.hash).some(event=> {
      if(!event?.contractId||StrKey.encodeContract(event.contractId.value)!==e.usdc)return false;
      const topics=event.body.v0.topics.map(scValToNative),data=scValToNative(event.body.v0.data);
      return topics[0]==='transfer'&&topics[1]===movement.from&&topics[2]===movement.to
        &&BigInt(typeof data==='bigint'?data:data.amount)===BigInt(movement.amount);
    }),movement.hash);
    assert.equal(movement.own,e.transactions.some(t=>t.hash===movement.hash));
  }
  for(const role of ['lender','borrower']) {
    for(const own of [true,false]) {
      const delta=reconciliation.movements.filter(x=>x.own===own).reduce((n,x)=>n+(x.to===e[role]?BigInt(x.amount):0n)-(x.from===e[role]?BigInt(x.amount):0n),0n);
      assert.equal(delta,BigInt(e.reconciliation.net[role][own?'own':'external']));
    }
  }
  result.reconciliation=reconciliation;
}
const step=name=>result.transactions.find(t=>t.label===name).ledger;
assert(step('deploy_rules')<step('handover_admin') && step('deploy_book')<step('handover_admin'));
assert(step('handover_admin')<step('open'));
assert(step('cap_lender_trustline')<step('repay_blocked_recipient'));
assert(step('repay_blocked_recipient')<step('restore_lender_trustline'));
assert(step('cap_borrower_trustline')<step('liquidate_blocked_surplus'));
assert(step('liquidate_blocked_surplus')<step('restore_borrower_trustline'));
result.transitionEvents={};result.openAuth={};
for(const label of ['open','open_two','repay_blocked_recipient','lender_claim','mark_default','liquidate_blocked_surplus','borrower_claim','lift_one','lift_two']) {
  const tx=await r.getTransaction(e.transactions.find(t=>t.label===label).hash);
  assert.equal(tx.status,'SUCCESS');
  result.transitionEvents[label]=(tx.events.contractEventsXdr??[]).flat().map(event=>({
    contractId:StrKey.encodeContract(event.contractId.value),
    topics:event.body.v0.topics.map(scValToNative),data:scValToNative(event.body.v0.data)
  }));
  if(label.startsWith('open')) {
    const parsed=TransactionBuilder.fromXDR(tx.envelopeXdr,Networks.TESTNET);
    assert.equal(parsed.source,e.borrower);
    const auth=parsed.operations[0].auth;
    result.openAuth[label]={source:parsed.source,credentials:auth.map(x=>x.credentials.type==='sorobanCredentialsSourceAccount'
      ? {type:'source'} : {type:'address',address:Address.fromScAddress(x.credentials.value.address).toString()})};
    assert(result.openAuth[label].credentials.some(x=>x.type==='source'));
    assert(result.openAuth[label].credentials.some(x=>x.address===e.lender));
    if(e.operator!==e.borrower) assert(result.openAuth[label].credentials.some(x=>x.address===e.operator));
  }
  if(label==='liquidate_blocked_surplus') {
    result.liquidationTime=tx.createdAt;
    assert(BigInt(tx.createdAt)>=BigInt(e.defaulted.loan.defaulted_at)+60n);
  }
}
const ev=result.transitionEvents;
assert(ev.open.some(v=>v.contractId===e.rulesContractId && v.topics[0]==='pledge' && v.data.pledged===true));
assert(ev.repay_blocked_recipient.some(v=>v.contractId===e.contractId&&v.topics[0]==='credit'&&v.topics[1]===e.lender));
assert(ev.liquidate_blocked_surplus.some(v=>v.contractId===e.contractId&&v.topics[0]==='credit'&&v.topics[1]===e.borrower));
for(const label of ['lift_one','lift_two']) assert(ev[label].some(v=>v.contractId===e.rulesContractId&&v.topics[0]==='pledge'&&v.data.pledged===false));
assert(e.checks.some(v=>v.label==='cure_window'&&v.error.includes('Error(Contract, #18)')));
assert(e.checks.filter(v=>v.label.startsWith('claim_')&&v.error.includes('Error(Contract, #16)')).length===2);
result.atomicSettlementVerified=true;result.borrowerSourceAuthorizationVerified=true;
result.orderVerified=true;result.completed=true;
writeFileSync(output,JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log('Verified',result.transactions.length,'hashes;',output);

// Read-only verification. No environment keys, signatures or transactions.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Contract, Networks, StrKey, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';
const input=process.argv[2]??'scripts/evidence/loan-book-testnet.json';
const output=input.replace(/\.json$/, '-verification.json');
const e=JSON.parse(readFileSync(input));assert.equal(e.phase,'C1');assert(e.completed);
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
for(const [name,id,file] of [['rules',e.rulesContractId,'rendaval_bond_rules'],['book',e.contractId,'rendaval_loan_book'],['escrow',e.escrow,'rendaval_test_escrow']]) {
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
for(const [field,value] of Object.entries({rules:e.rulesContractId,issuer:e.issuer,operator:e.operator,usdc:e.usdc,margin_bps:7000,default_bps:8500,max_step_bps:2500,discount_bps:500}))assert.equal(result.bookConfig[field],value);
assert.equal(result.bookConfig.max_price_age,86400n);
result.loan=await read(e.contractId,'get_loan',[a(e.escrow)]);assert.equal(result.loan.loan.status[0],'Repaid');
result.pledged=await read(e.rulesContractId,'pledged',[a(e.bondToken),a(e.escrow)]);assert.equal(result.pledged,false);
result.escrowBalance=await read(e.bondToken,'balance',[a(e.escrow)]);assert.equal(result.escrowBalance,0n);
result.lenderUsdc=await read(e.usdc,'balance',[a(e.lender)]);assert.equal(result.lenderUsdc.toString(),e.finalLenderUsdc);
const step=name=>result.transactions.find(t=>t.label===name).ledger;
assert(step('immutable_flags')<step('borrower_bond_trustline'));
assert(step('immutable_flags')<step('deploy_rules'));
assert(step('deploy_rules')<step('handover_admin') && step('deploy_book')<step('handover_admin'));
assert(step('handover_admin')<step('open'));
assert(step('repay')<step('return_collateral') && step('return_collateral')<step('lift_pledge'));
// Persist decoded inclusion evidence, not just the final state. The pledge and
// lender transfer must be in the very same open transaction; retry emits no pledge.
result.transitionEvents={};
for(const label of ['open','repay','return_collateral','lift_pledge','lift_pledge_retry']) {
  const tx=await r.getTransaction(e.transactions.find(t=>t.label===label).hash);
  assert.equal(tx.status,'SUCCESS');
  result.transitionEvents[label]=(tx.events.contractEventsXdr??[]).flat().map(event=>({
    contractId:StrKey.encodeContract(event.contractId.value),
    topics:event.body.v0.topics.map(scValToNative),data:scValToNative(event.body.v0.data)
  }));
}
const events=result.transitionEvents;
assert(events.open.some(v=>v.contractId===e.rulesContractId && v.topics[0]==='pledge' && v.data.pledged===true));
assert(events.open.some(v=>v.contractId===e.usdc && v.topics[0]==='transfer' && v.topics[1]===e.lender && v.topics[2]===e.borrower && v.data===500_000_000n));
assert(!events.repay.some(v=>v.contractId===e.rulesContractId && v.topics[0]==='pledge'));
assert(events.return_collateral.some(v=>v.contractId===e.bondToken && v.topics[0]==='transfer' && v.topics[1]===e.escrow && v.data===1_000_000_000n));
assert(events.lift_pledge.some(v=>v.contractId===e.rulesContractId && v.topics[0]==='pledge' && v.data.pledged===false));
assert(!events.lift_pledge_retry.some(v=>v.contractId===e.rulesContractId && v.topics[0]==='pledge'));
result.atomicOpenVerified=true;result.releaseRetryVerified=true;
result.orderVerified=true;result.completed=true;
writeFileSync(output,JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log('Verified',result.transactions.length,'hashes;',output);

// Read-only verification of the current deployment and real server journeys.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Address, Asset, Contract, Networks, TransactionBuilder, rpc, scValToNative, StrKey } from '@stellar/stellar-sdk';
const e=JSON.parse(readFileSync('scripts/evidence/c4-testnet.json'));
const journey=JSON.parse(readFileSync('scripts/evidence/c4-server.json'));
const prior=JSON.parse(readFileSync('scripts/evidence/archive/c4/first-book-server.json'));
const authorization=JSON.parse(readFileSync('scripts/evidence/c4-authorization.json'));
const cleanup=JSON.parse(readFileSync('scripts/evidence/c4-classic-cleanup.json'));
const server=new rpc.Server('https://soroban-testnet.stellar.org');
const a=s=>new Address(s).toScVal();
const out={network:'TESTNET',verifiedAt:new Date().toISOString(),wasm:{},loans:{},transactions:[],movements:[]};
async function read(id,method,args=[]) {
 const tx=new TransactionBuilder(await server.getAccount(e.operator),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();
 const r=await server.simulateTransaction(tx); assert(rpc.Api.isSimulationSuccess(r),r.error); return scValToNative(r.result.retval);
}
assert(e.deployed && journey.completed && authorization.completed);
assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
assert.equal(new Asset('RBOND',e.issuer).contractId(Networks.TESTNET),e.bondToken);
const issuerResponse=await fetch('https://horizon-testnet.stellar.org/accounts/'+e.issuer);assert(issuerResponse.ok);
out.issuerFlags=(await issuerResponse.json()).flags;
assert.deepEqual(out.issuerFlags,{auth_required:true,auth_revocable:true,auth_immutable:true,auth_clawback_enabled:false});
const sac=(await server.getLedgerEntries(new Contract(e.bondToken).getFootprint())).entries[0];
assert.equal(sac.val.contractData.val.instance.executable.type,'contractExecutableStellarAsset');
out.rules=await read(e.rulesContractId,'get_config'); assert.equal(out.rules.book,e.contractId);
assert.equal(await read(e.bondToken,'admin'),e.rulesContractId);
out.livePledges=await read(e.rulesContractId,'live_pledges'); assert.equal(out.livePledges,0n);
assert.equal(await read(e.registry,'get_operator'),e.operator);
out.config=await read(e.contractId,'get_config'); assert.equal(out.config.rules,e.rulesContractId);
const contracts=[['book',e.contractId,'rendaval_loan_book',e.wasm.book.sha256],['registry',e.registry,'rendaval_app_registry',e.wasm.registry.sha256],['rules',e.rulesContractId,'rendaval_bond_rules','f76b91182e5a23bc2a0fb26ca711a43e94a1fa223bf358de403d67ec83e25139']];
for(const name of ['repaid','liquidated']) {
 const id=journey.steps[name+'-accept'].contractId;
 const spec=await read(e.contractId,'get_vault',[a(id)]), loan=await read(e.contractId,'get_loan',[a(id)]);
 assert.equal(spec.borrower,journey.wallet); assert.equal(loan.loan.status[0],name==='repaid'?'Repaid':'Liquidated');
 for(const [kind,address] of [['vault',id],['delivery',spec.delivery]]) {
  contracts.push([name+'-'+kind,address,'rendaval_loan_vault',e.wasm.vault.sha256]);
  assert.equal((await read(address,'get_config')).book,e.contractId);
  assert.equal(await read(e.bondToken,'balance',[a(address)]),0n);
  assert.equal(await read(e.usdc,'balance',[a(address)]),0n);
  assert.equal(await read(e.rulesContractId,'pledged',[a(e.bondToken),a(address)]),false);
 }
 assert.equal(await read(e.usdc,'balance',[a(journey.steps[name+'-fund'].escrowId)]),0n);
 out.loans[name]={id,spec,loan};
}
for(const [name,id,file,expected] of contracts) {
 const row=(await server.getLedgerEntries(new Contract(id).getFootprint())).entries[0]; assert(row);
 const deployed=Buffer.from(row.val.contractData.val.instance.executable.wasmHash.value).toString('hex');
 const local=createHash('sha256').update(readFileSync(`contracts/target/wasm32v1-none/release/${file}.wasm`)).digest('hex');
 assert.equal(deployed,expected);assert.equal(local,expected);out.wasm[name]={id,sha256:expected,liveUntilLedgerSeq:row.liveUntilLedgerSeq};
}
const priorId=prior.steps['repaid-accept'].contractId;
const priorLoan=await read(e.intermediateBook,'get_loan',[a(priorId)]);
assert.equal(priorLoan.loan.status[0],'Repaid');out.intermediate={book:e.intermediateBook,loan:priorId,status:'Repaid'};
const intermediateEntry=(await server.getLedgerEntries(new Contract(e.intermediateBook).getFootprint())).entries[0];
assert.equal(Buffer.from(intermediateEntry.val.contractData.val.instance.executable.wasmHash.value).toString('hex'),e.intermediateBookWasm.sha256);
out.authorizationChecks=authorization.results.length;
for(const row of cleanup) {
 const r=await fetch('https://horizon-testnet.stellar.org/accounts/'+row.account);assert(r.ok);
 const account=await r.json();assert(!Object.keys(account.data).some(k=>k.startsWith('b1:')));
 assert.equal(createHash('sha256').update(JSON.stringify(Object.entries(account.data).sort())).digest('hex'),row.preservedHash);
 assert.equal(Object.keys(account.data).length,row.afterEntries);
 assert.equal(account.subentry_count,row.subentries);
}
out.classicCleanup=cleanup.map(({account,removed,afterEntries,subentrySlotsRemaining})=>({account,removed:removed.length,afterEntries,subentrySlotsRemaining}));
const extra=[prior,journey].flatMap(j=>Object.entries(j.steps).flatMap(([label,v])=>{
 const hash=v?.hash??v?.txHash;return typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)?[{label,hash}]:[];
}));
const txs=[...e.transactions,...prior.transactions,...journey.transactions,...authorization.transactions,...extra,...cleanup.flatMap(row=>row.hashes.map(hash=>({label:'cleanup:'+row.account,hash})))];
const seen=new Set();
for(let start=0;start<txs.length;start+=4) { await Promise.all(txs.slice(start,start+4).map(async t=>{
 if(seen.has(t.hash))return;seen.add(t.hash);
 const response=await fetch('https://horizon-testnet.stellar.org/transactions/'+t.hash);assert(response.ok,t.label);
 const tx=await response.json();assert(tx.successful,t.label);out.transactions.push({label:t.label,hash:t.hash,ledger:tx.ledger,feeCharged:tx.fee_charged});
 const r=await server.getTransaction(t.hash);assert.equal(r.status,'SUCCESS',t.label);
 const events=[...(r.events?.contractEventsXdr??[]).flat(),...(r.events?.transactionEventsXdr??[]).map(x=>x.event)];
 for(const event of events) {
  if(!event?.contractId)continue;
  const topics=event.body.v0.topics.map(scValToNative),data=scValToNative(event.body.v0.data);
  if(topics[0]==='transfer')out.movements.push({hash:t.hash,token:StrKey.encodeContract(event.contractId.value),from:topics[1],to:topics[2],amount:BigInt(data.amount??data)});
 }
}));
 if(start%40===0)console.log('Verified',out.transactions.length,'transaction hashes');
}
for(const who of [journey.wallet,e.lender])assert.equal(await read(e.contractId,'claimable',[a(who)]),0n);
assert.equal(await read(e.usdc,'balance',[a(e.contractId)]),0n);
assert.equal(await read(e.usdc,'balance',[a(e.rounding.id)]),0n);
assert.equal(await read(e.usdc,'balance',[a(e.rounding.escrow)]),0n);
const release=e.transactions.find(t=>t.label==='rounding_release-funds');
assert(release.events.some(x=>x.contract===e.usdc && x.topics[0]==='transfer' && x.topics[1]===e.rounding.escrow && x.topics[2]===e.rounding.id && String(x.data.amount??x.data)==='9970001'));
const gross=[...Object.values(journey.budget),...Object.values(prior.budget)].reduce((n,v)=>n+BigInt(v),0n)+BigInt(e.rounding.principal);
const actual=out.movements.filter(m=>m.token===e.usdc&&m.from===e.lender).reduce((n,m)=>n+m.amount,0n);
assert.equal(actual,gross,'All real lender transfers must match budget');
assert(actual<=4000000000n);out.grossLenderSpend=actual;out.rounding=e.rounding;
out.returnedToLender=out.movements.filter(m=>m.token===e.usdc&&m.to===e.lender).reduce((n,m)=>n+m.amount,0n);
const receivers=new Map([[e.rounding.escrow,e.rounding.id],[prior.steps['repaid-fund'].escrowId,priorId],...['repaid','liquidated'].map(n=>[journey.steps[n+'-fund'].escrowId,journey.steps[n+'-accept'].contractId])]);
out.escrowFees=out.movements.filter(m=>m.token===e.usdc&&receivers.has(m.from)&&m.to!==receivers.get(m.from)).reduce((n,m)=>n+m.amount,0n);
assert.equal(out.escrowFees,4530000n);
assert(journey.steps.atomicTransfers.length>0);out.atomicTransfers=journey.steps.atomicTransfers;
out.verified=true;
writeFileSync('scripts/evidence/c4-verification.json',JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log('Verified deployment and',out.transactions.length,'hashes; gross lender base units:',String(gross));

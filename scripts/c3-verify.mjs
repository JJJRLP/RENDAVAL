// Independent read-only verification; no keys, signatures or submissions.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Address,Asset,Contract,Networks,TransactionBuilder,rpc,scValToNative,StrKey} from '@stellar/stellar-sdk';
const e=JSON.parse(readFileSync('scripts/evidence/c3-testnet.json')),probe=JSON.parse(readFileSync('scripts/research/c3/contract-receiver.json'));
assert(e.completed,'Real run incomplete');
const server=new rpc.Server('https://soroban-testnet.stellar.org'),a=s=>new Address(s).toScVal();
const out={network:'TESTNET',verifiedAt:new Date().toISOString(),contractId:e.contractId,transactions:[],movements:[],wasm:{},loans:{},costs:{}};
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
async function read(id,method,args=[]){const tx=new TransactionBuilder(await server.getAccount(e.operator),{fee:'1000000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();const s=await server.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(s),s.error);return scValToNative(s.result.retval);}
async function verifyTx(t,group){const r=await server.getTransaction(t.hash);assert.equal(r.status,'SUCCESS',t.label);const response=await fetch('https://horizon-testnet.stellar.org/transactions/'+t.hash);assert(response.ok);const h=await response.json();assert(h.successful);out.transactions.push({label:t.label,group,hash:t.hash,ledger:r.ledger,feeStroops:h.fee_charged});out.costs[group+':'+t.label]=h.fee_charged;const events=[...(r.events?.contractEventsXdr??[]).flat(),...(r.events?.transactionEventsXdr??[]).map(x=>x.event)];const transfers=[];for(const event of events){if(!event?.contractId)continue;const token=StrKey.encodeContract(event.contractId.value),topics=event.body.v0.topics.map(scValToNative),data=scValToNative(event.body.v0.data);if(topics[0]!=='transfer')continue;const amount=typeof data==='bigint'?data:BigInt(data.amount);transfers.push({token,from:topics[1],to:topics[2],amount});}out.movements.push(...transfers.map(x=>({group,label:t.label,hash:t.hash,...x})));return transfers;}
for(const [group,ts] of [['prerequisite',probe.steps],['C3b',e.transactions]]){
 for(let start=0;start<ts.length;start+=4){await Promise.all(ts.slice(start,start+4).map(t=>verifyTx(t,group)));}
}
assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
assert.equal(new Asset('RBOND',e.issuer).contractId(Networks.TESTNET),e.bondToken);
const sac=(await server.getLedgerEntries(new Contract(e.bondToken).getFootprint())).entries[0];assert.equal(sac.val.contractData.val.instance.executable.type,'contractExecutableStellarAsset');
const issuerResponse=await fetch('https://horizon-testnet.stellar.org/accounts/'+e.issuer);assert(issuerResponse.ok);out.issuerFlags=(await issuerResponse.json()).flags;
assert.deepEqual(out.issuerFlags,{auth_required:true,auth_revocable:true,auth_immutable:true,auth_clawback_enabled:false});
out.rulesConfig=await read(e.rulesContractId,'get_config');assert.equal(out.rulesConfig.book,e.contractId);assert.equal(out.rulesConfig.issuer,e.issuer);assert.equal(out.rulesConfig.operator,e.operator);
assert.equal(await read(e.bondToken,'admin'),e.rulesContractId);assert.equal(await read(e.rulesContractId,'live_pledges'),0n);
out.bookConfig=await read(e.contractId,'get_config');assert.equal(out.bookConfig.rules,e.rulesContractId);assert.equal(out.bookConfig.usdc,e.usdc);
for(const [name,id,filename,expected] of [
 ['book',e.contractId,'rendaval_loan_book',e.wasm.book.sha256],
 ['rules',e.rulesContractId,'rendaval_bond_rules','f76b91182e5a23bc2a0fb26ca711a43e94a1fa223bf358de403d67ec83e25139'],
 ...Object.entries(e.loans).flatMap(([name,v])=>[[name,v.id,'rendaval_loan_vault',e.wasm.vault.sha256],[name+'_delivery',v.delivery,'rendaval_loan_vault',e.wasm.vault.sha256]])]){
 const entry=(await server.getLedgerEntries(new Contract(id).getFootprint())).entries[0];assert(entry);const deployed=Buffer.from(entry.val.contractData.val.instance.executable.wasmHash.value).toString('hex');const local=createHash('sha256').update(readFileSync(`contracts/target/wasm32v1-none/release/${filename}.wasm`)).digest('hex');assert.equal(deployed,expected);assert.equal(deployed,local);out.wasm[name]={id,sha256:deployed,liveUntilLedgerSeq:entry.liveUntilLedgerSeq};
}
const sum=(group,address)=>out.movements.filter(x=>x.group===group&&x.token===e.usdc).reduce((n,x)=>n+(x.to===address?x.amount:0n)-(x.from===address?x.amount:0n),0n);
const fee='GA6KH5VWPCHBOEF63X57SPX6T4H366YFFKKGCVDBTXT2N7JVL6PJCK7G';
out.net={prerequisiteLender:sum('prerequisite',e.lender),prerequisiteFee:sum('prerequisite',fee),lender:sum('C3b',e.lender),fee:sum('C3b',fee)};
assert.equal(out.net.prerequisiteLender,-30000n);assert.equal(out.net.prerequisiteFee,30000n);
assert.equal(out.net.lender,-1800000n);assert.equal(out.net.fee,1800000n);
const transfer=(group,label,token,from,to,amount)=>assert(out.movements.some(x=>x.group===group&&x.label===label&&x.token===token&&x.from===from&&x.to===to&&x.amount===amount),`Missing transfer ${label}: ${from} -> ${to}`);
transfer('prerequisite','release',e.usdc,probe.escrow,probe.receiver,9970000n);
assert.equal(await read(e.usdc,'balance',[a(probe.receiver)]),0n);assert.equal(await read(e.usdc,'balance',[a(probe.escrow)]),0n);
for(const [name,v] of Object.entries(e.loans)){
 const vc=await read(v.id,'get_config'),dc=await read(v.delivery,'get_config');assert.equal(vc.book,e.contractId);assert.equal(vc.borrower,e.borrower);assert.equal(vc.lender,e.lender);assert.equal(vc.delivery,v.delivery);assert.equal(vc.state[0],'Closed');assert.equal(dc.state[0],'Closed');
 const tw=await read(v.escrow,'get_escrow');assert.equal(tw.roles.receiver,v.id);assert.equal(tw.trustline.address,e.usdc);assert.equal(tw.platform_fee,0);assert.equal(tw.amount,200000000n);
 for(const id of [v.id,v.delivery]){assert.equal(await read(e.bondToken,'balance',[a(id)]),0n);assert.equal(await read(e.usdc,'balance',[a(id)]),0n);assert.equal(await read(e.rulesContractId,'pledged',[a(e.bondToken),a(id)]),false);}
 assert.equal(await read(e.usdc,'balance',[a(v.escrow)]),0n);
 out.loans[name]={id:v.id,delivery:v.delivery,escrow:v.escrow,vaultState:vc.state,twFlags:tw.flags};
 if(name==='cancelled'){
   transfer('C3b','tw_refund',e.usdc,v.escrow,e.lender,199400000n);
   transfer('C3b','return_cancelled_bonds',e.bondToken,v.id,e.borrower,400000000n);
   const tx=new TransactionBuilder(await server.getAccount(e.operator),{fee:'1000000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(e.contractId).call('get_loan',a(v.id))).setTimeout(60).build();
   const sim=await server.simulateTransaction(tx);assert(sim.error?.includes('Error(Contract, #4)'),'Cancelled loan must not have debt');
 }else{
   const view=await read(e.contractId,'get_loan',[a(v.id)]);out.loans[name].view=view;
   assert.equal(view.loan.status[0],name==='repaid'?'Repaid':'Liquidated');assert.equal(view.loan.principal,200000000n);assert.equal(view.loan.net_disbursement,199400000n);assert.equal(view.loan.escrow_fee,600000n);
   transfer('C3b','tw_release-funds_'+name,e.usdc,v.escrow,v.id,199400000n);
   transfer('C3b','open_'+name,e.usdc,v.id,e.borrower,199400000n);
   const label=name==='repaid'?'repay':'liquidate',recipient=name==='repaid'?e.borrower:e.buyer;
   transfer('C3b',label,e.bondToken,v.id,recipient,400000000n);
   if(name==='repaid')transfer('C3b',label,e.usdc,e.borrower,e.contractId,view.debt);
   else transfer('C3b',label,e.usdc,e.buyer,e.contractId,view.loan.proceeds);
 }
}
for(const role of ['borrower','buyer']){assert.equal(sum('C3b',e[role]),0n);assert.equal(await read(e.usdc,'balance',[a(e[role])]),0n);assert.equal(await read(e.bondToken,'balance',[a(e[role])]),0n);}
for(const role of ['borrower','buyer','lender'])assert.equal(await read(e.contractId,'claimable',[a(e[role])]),0n);
assert.equal(await read(e.usdc,'balance',[a(e.contractId)]),0n);
out.lenderGross=out.movements.filter(x=>x.token===e.usdc&&x.from===e.lender).reduce((n,x)=>n+x.amount,0n);assert(out.lenderGross<=3000000000n);assert.equal(out.lenderGross,920000000n);
out.lenderNow=await read(e.usdc,'balance',[a(e.lender)]);out.lenderChangeDuringRun=BigInt(e.final.lender)-BigInt(e.initial.lender);assert.equal(out.lenderChangeDuringRun,out.net.lender);
out.verified=true;writeFileSync('scripts/evidence/c3-verification.json',json(out)+'\n');console.log(json({verified:true,transactions:out.transactions.length,net:out.net,gross:out.lenderGross}));

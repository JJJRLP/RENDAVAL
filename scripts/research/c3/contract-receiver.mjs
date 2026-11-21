// Testnet prerequisite. All TW writes use its API; only public evidence is saved.
// Run stages individually. Pending hashes must be reconciled before another send.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {Address,Contract,Keypair,Networks,Operation,TransactionBuilder,rpc,scValToNative,nativeToScVal} from '@stellar/stellar-sdk';
const file=new URL('./contract-receiver.json',import.meta.url), old=JSON.parse(readFileSync(new URL('../../evidence/archive/c2/loan-book-testnet.json',import.meta.url)));
const p=Keypair.fromSecret(process.env.VAULT_SECRET_KEY),l=Keypair.fromSecret(process.env.LENDER_SECRET_KEY), server=new rpc.Server('https://soroban-testnet.stellar.org'), stage=process.argv[2];
let e=existsSync(file)?JSON.parse(readFileSync(file)):{network:'TESTNET',startedAt:new Date().toISOString(),operator:p.publicKey(),lender:l.publicKey(),amount:'1',salt:randomBytes(32).toString('hex'),steps:[]};
if(Array.isArray(e.escrow)){e.deployResult=e.escrow;e.escrow=e.escrow[0];}
const a=s=>new Address(s).toScVal();
function save(){const s=JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2);assert(!/\bS[A-Z2-7]{55}\b/.test(s));writeFileSync(file,s+'\n');}
async function build(op,k=p){return new TransactionBuilder(await server.getAccount(k.publicKey()),{fee:'1000000',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(180).build();}
async function read(id,method,args=[]){const s=await server.simulateTransaction(await build(new Contract(id).call(method,...args)));assert(s.result,s.error);return scValToNative(s.result.retval);}
async function confirm(t){for(let i=0;i<25;i++){const r=await server.getTransaction(t.hash);if(r.status!=='NOT_FOUND'){t.status=r.status;t.ledger=r.ledger;save();assert.equal(r.status,'SUCCESS');return r.returnValue?scValToNative(r.returnValue):null;}await new Promise(r=>setTimeout(r,1500));}throw Error('Pending hash: reconcile before retry');}
async function send(tx,k,label,api=false){assert(!e.steps.some(s=>s.label===label),'Stage already journaled; inspect evidence');tx.sign(k);const t={label,hash:Buffer.from(tx.hash()).toString('hex'),status:'PENDING'};e.steps.push(t);save();if(api)await request('/helper/send-transaction',{signedXdr:tx.toXDR()},false);else await server.sendTransaction(tx);const v=await confirm(t);console.log(label,t.hash,t.status);return v;}
async function request(path,body,record=true){const r=await fetch('https://dev.api.trustlesswork.com'+path,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.TRUSTLESS_WORK_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const b=await r.json();if(record){e.requests??=[];e.requests.push({path,request:body,status:r.status,message:b.message??b.error??null,built:typeof b.unsignedTransaction==='string'});save();}if(!r.ok)throw Error('API HTTP '+r.status+': '+JSON.stringify(b));return b;}
async function api(path,body,k){const b=await request(path,body);const tx=TransactionBuilder.fromXDR(b.unsignedTransaction,Networks.TESTNET);return send(tx,k,stage,true);}
try{
assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
const roles={serviceProvider:p.publicKey(),receiver:e.receiver,approver:l.publicKey(),platformAddress:p.publicKey(),releaseSigner:p.publicKey(),disputeResolver:p.publicKey()};
if(stage==='receiver'){
const op=Operation.createCustomContract({address:new Address(p.publicKey()),wasmHash:Buffer.from(old.wasm.escrow.sha256,'hex'),salt:Buffer.from(e.salt,'hex'),constructorArgs:[a(l.publicKey())]});
e.receiver=await send(await server.prepareTransaction(await build(op)),p,stage);save();
}else if(stage==='deploy'){
assert(e.receiver);e.escrow=await api('/deployer/single-release',{signer:p.publicKey(),engagementId:'c3b-contract-'+e.salt.slice(0,12),title:'C3b contract receiver prerequisite',description:'1 USDC testnet, recoverable contract receiver',roles,amount:1,platformFee:0,milestones:[{description:'Contract receiver capability test'}],trustline:{address:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',symbol:'USDC'}},p);if(Array.isArray(e.escrow)){e.deployResult=e.escrow;e.escrow=e.escrow[0];}save();
}else if(stage==='fund')await api('/escrow/single-release/fund-escrow',{contractId:e.escrow,signer:l.publicKey(),amount:1},l);
else if(stage==='complete')await api('/escrow/single-release/change-milestone-status',{contractId:e.escrow,milestoneIndex:'0',newEvidence:'Receiver fixture deployed',newStatus:'completed',serviceProvider:p.publicKey()},p);
else if(stage==='approve')await api('/escrow/single-release/approve-milestone',{contractId:e.escrow,milestoneIndex:'0',approver:l.publicKey()},l);
else if(stage==='release')await api('/escrow/single-release/release-funds',{contractId:e.escrow,releaseSigner:p.publicKey()},p);
else if(stage==='dispute')await api('/escrow/single-release/dispute-escrow',{contractId:e.escrow,signer:l.publicKey()},l);
else if(stage==='refund')await api('/escrow/single-release/resolve-dispute',{contractId:e.escrow,disputeResolver:p.publicKey(),distributions:[{address:l.publicKey(),amount:1}]},p);
else if(stage==='cleanup')await send(await server.prepareTransaction(await build(new Contract(e.receiver).call('withdraw',a(old.usdc)),l)),l,stage);
else if(stage!=='read')throw Error('Unknown stage');
e.balances={at:new Date().toISOString(),receiver:e.receiver?await read(old.usdc,'balance',[a(e.receiver)]):null,escrow:e.escrow?await read(old.usdc,'balance',[a(e.escrow)]):null,lender:await read(old.usdc,'balance',[a(l.publicKey())])};if(e.escrow)e.escrowState=await read(e.escrow,'get_escrow');e.snapshots??=[];e.snapshots.push({stage,...e.balances});save();console.log(JSON.stringify(e.balances,(_,v)=>typeof v==='bigint'?v.toString():v));
}catch(err){e.errors??=[];e.errors.push({stage,at:new Date().toISOString(),message:err.message});save();console.error(err.message);process.exitCode=1;}

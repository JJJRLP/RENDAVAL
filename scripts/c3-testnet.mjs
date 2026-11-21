// Real testnet only. Every TW mutation is built and sent through its API.
// Public hash journal makes stages resumable; ephemeral keys are derived only in memory.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {Address,Asset,Contract,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,rpc,scValToNative,StrKey} from '@stellar/stellar-sdk';
const file='scripts/evidence/c3-testnet.json', server=new rpc.Server('https://soroban-testnet.stellar.org');
const operator=Keypair.fromSecret(process.env.VAULT_SECRET_KEY),issuer=Keypair.fromSecret(process.env.BOND_ISSUER_SECRET_KEY),lender=Keypair.fromSecret(process.env.LENDER_SECRET_KEY);
const ephemeral=role=>Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY).update('rendaval-c3b-testnet-v1-'+role).digest());
const borrower=ephemeral('borrower'),buyer=ephemeral('buyer'),keys=[operator,issuer,lender,borrower,buyer];
const rules='CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC',oldBook='CA57AQCW24723MQ6IKR5YKZAMMKKDX5DIMC25UVYBWZHIWXTYTRHSSVS';
const bondAsset=new Asset('RBOND',issuer.publicKey()),usdAsset=new Asset('USDC','GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const bond=bondAsset.contractId(Networks.TESTNET),usd=usdAsset.contractId(Networks.TESTNET),unit=10000000n;
const a=s=>new Address(s).toScVal(),i=n=>nativeToScVal(BigInt(n),{type:'i128'}),u=n=>nativeToScVal(n,{type:'u32'}),u64=n=>nativeToScVal(BigInt(n),{type:'u64'}),sym=s=>nativeToScVal(s,{type:'symbol'}),bytes=b=>nativeToScVal(b),bool=b=>nativeToScVal(b);
const decimal=n=>`${n/unit}.${(n%unit).toString().padStart(7,'0')}`;
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
let e=existsSync(file)?JSON.parse(readFileSync(file)):{phase:'C3b',network:'TESTNET',startedAt:new Date().toISOString(),operator:operator.publicKey(),issuer:issuer.publicKey(),lender:lender.publicKey(),borrower:borrower.publicKey(),buyer:buyer.publicKey(),rulesContractId:rules,oldBook,bondToken:bond,usdc:usd,transactions:[],salts:{},loans:{},checks:[],grossLenderSpend:'0'};
function save(){const s=json(e);assert(!/\bS[A-Z2-7]{55}\b/.test(s));writeFileSync(file,s+'\n');}
function salt(name){if(!e.salts[name]){e.salts[name]=randomBytes(32).toString('hex');save();}return Buffer.from(e.salts[name],'hex');}
async function build(op,k=operator){return new TransactionBuilder(await server.getAccount(k.publicKey()),{fee:'1000000',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(180).build();}
async function read(id,method,args=[]){const sim=await server.simulateTransaction(await build(new Contract(id).call(method,...args)));assert(rpc.Api.isSimulationSuccess(sim),`${method}: ${sim.error}`);return scValToNative(sim.result.retval);}
async function confirm(entry){for(let n=0;n<35;n++){const r=await server.getTransaction(entry.hash);if(r.status!=='NOT_FOUND'){entry.status=r.status;entry.ledger=r.ledger;entry.returnValue=r.returnValue?scValToNative(r.returnValue):null;entry.feeCharged=r.feeCharged??null;entry.events=[...(r.events?.contractEventsXdr??[]).flat(),...(r.events?.transactionEventsXdr??[]).map(x=>x.event)].filter(x=>x?.contractId).map(x=>({contract:StrKey.encodeContract(x.contractId.value),topics:x.body.v0.topics.map(scValToNative),data:scValToNative(x.body.v0.data)}));save();assert.equal(r.status,'SUCCESS',entry.label);return entry.returnValue;}await new Promise(r=>setTimeout(r,1500));}throw Error('Unknown outcome: inspect '+entry.hash+' before proceeding');}
async function prior(label){const entry=e.transactions.find(x=>x.label===label);if(!entry)return null;if(entry.status==='SUCCESS')return {value:entry.returnValue};return {value:await confirm(entry)};}
async function send(label,tx,k,api=false){tx.sign(k);const entry={label,hash:Buffer.from(tx.hash()).toString('hex'),status:'PENDING'};e.transactions.push(entry);save();if(api)await request('/helper/send-transaction',{signedXdr:tx.toXDR()},false);else {const r=await server.sendTransaction(tx);assert(r.status!=='ERROR',label+' rejected; inspect journal');}const value=await confirm(entry);console.log(label,entry.hash,'SUCCESS');return value;}
async function submit(label,k,op,soroban=true){const done=await prior(label);if(done)return done.value;let tx=await build(op,k);if(soroban){const sim=await server.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(sim),label+': '+sim.error);for(let n=0;n<sim.result.auth.length;n++){const auth=sim.result.auth[n];if(auth.credentials.type==='sorobanCredentialsSourceAccount')continue;const who=Address.fromScAddress(auth.credentials.value.address).toString(),key=keys.find(k=>k.publicKey()===who);assert(key,'Unexpected authorization');sim.result.auth[n]=await authorizeEntry(auth,key,sim.latestLedger+100,Networks.TESTNET);}tx=rpc.assembleTransaction(tx,sim).build();const enforced=await server.simulateTransaction(tx,undefined,'enforce');assert(rpc.Api.isSimulationSuccess(enforced),label+' auth: '+enforced.error);if(label.startsWith('create_')||label.startsWith('open_')||label==='liquidate'){e.resources??={};e.resources[label]={minResourceFee:sim.minResourceFee,resources:sim.transactionData.build().resources};save();}}return send(label,tx,k);}
const invoke=(label,k,id,method,args=[])=>submit(label,k,new Contract(id).call(method,...args));
async function request(path,body,record=true){const r=await fetch('https://dev.api.trustlesswork.com'+path,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.TRUSTLESS_WORK_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const b=await r.json();if(record){e.api??=[];e.api.push({path,request:body,httpStatus:r.status,built:typeof b.unsignedTransaction==='string',message:b.message??b.error??null});save();}assert(r.ok,'TW HTTP '+r.status+': '+JSON.stringify(b));return b;}
async function tw(label,path,body,k){const done=await prior(label);if(done)return done.value;const b=await request(path,body),tx=TransactionBuilder.fromXDR(b.unsignedTransaction,Networks.TESTNET);const sim=await server.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(sim),label+': '+sim.error);return send(label,tx,k,true);}
async function reject(label,k,id,method,args){if(e.checks.some(x=>x.label===label))return;const sim=await server.simulateTransaction(await build(new Contract(id).call(method,...args),k));assert(!rpc.Api.isSimulationSuccess(sim),label+' unexpectedly allowed');e.checks.push({label,error:sim.error});save();}
async function spend(label,amount,fn){if(!e.transactions.some(x=>x.label===label)){const total=BigInt(e.grossLenderSpend)+amount;assert(total+unit<=300n*unit);e.grossLenderSpend=total.toString();save();}return fn();}
async function transfer(label,from,to,amount){if(amount===0n)return;return invoke(label,from,usd,'transfer',[a(from.publicKey()),a(to),i(amount)]);}
async function deploy(name,filename,args){const wasm=readFileSync(`contracts/target/wasm32v1-none/release/${filename}.wasm`),hash=createHash('sha256').update(wasm).digest();e.wasm??={};if(e.wasm[name])assert.equal(e.wasm[name].sha256,hash.toString('hex'),'Code changed after deployment');e.wasm[name]={sha256:hash.toString('hex'),bytes:wasm.length};save();await submit('upload_'+name,operator,Operation.uploadContractWasm({wasm}));if(!args)return hash;return submit('deploy_'+name,operator,Operation.createCustomContract({address:new Address(operator.publicKey()),wasmHash:hash,salt:salt(name),constructorArgs:args}));}
async function waitUntil(timestamp){for(;;){const now=Number((await server.getLatestLedger()).closeTime);if(now>=Number(timestamp))return;await new Promise(r=>setTimeout(r,3000));}}
async function main(){
assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);assert.equal(bond,'CDMVILWEW47LHWNCHDILEBOECA5VDTP6QTRITWPATAVPXWXXSLRQEGC3');
for(const role of ['operator','issuer','lender','borrower','buyer'])assert.equal(e[role],({operator,issuer,lender,borrower,buyer})[role].publicKey());
assert(!e.completed,'Already complete; use c3-verify.mjs');
if(!e.initial){e.initial={lender:await read(usd,'balance',[a(lender.publicKey())]),rules:await read(rules,'get_config'),livePledges:await read(rules,'live_pledges')};assert.equal(e.initial.livePledges,0n);assert.equal(e.initial.rules.book,oldBook);save();}
for(const [name,k] of [['borrower',borrower],['buyer',buyer]]){
 if(!e.transactions.some(x=>x.label==='friendbot_'+name)){const r=await fetch('https://friendbot.stellar.org/?addr='+k.publicKey());assert(r.ok,'Friendbot failed');const b=await r.json();e.transactions.push({label:'friendbot_'+name,hash:b.hash??b.transaction_hash,status:'SUCCESS'});save();}
 await submit(name+'_usd_trustline',k,Operation.changeTrust({asset:usdAsset}),false);
 await submit(name+'_bond_trustline',k,Operation.changeTrust({asset:bondAsset}),false);
 await invoke('approve_'+name,issuer,rules,'set_authorized',[a(bond),a(k.publicKey()),bool(true)]);
}
const hash=await deploy('vault','rendaval_loan_vault');
e.contractId=await deploy('book','rendaval_loan_book',[a(operator.publicKey()),a(issuer.publicKey()),a(usd),a(rules),u(7000),u(8500),u(2500),u64(86400),u(500),u(30),u64(30),u64(60)]);save();
const book=e.contractId;
await invoke('pin_vault_code',operator,book,'set_vault_code',[bytes(hash)]);
await invoke('replace_book',operator,rules,'replace_book',[a(book)]);
assert.equal((await read(rules,'get_config')).book,book);assert.equal(await read(bond,'admin'),rules);
await invoke('register_series',issuer,book,'register_series',[sym('C3_DEMO'),bytes(bondAsset.toXDRObject().toXDR())]);
await invoke('publish_initial_price',issuer,book,'publish_price',[sym('C3_DEMO'),i(unit)]);
// A gross budget of 60 escrow funding + 1 top-up + 30 buyer liquidity, plus 1 prerequisite.
await spend('borrower_topup',unit,()=>transfer('borrower_topup',lender,borrower.publicKey(),unit));
await spend('buyer_liquidity',30n*unit,()=>transfer('buyer_liquidity',lender,buyer.publicKey(),30n*unit));
await submit('issue_bonds',issuer,Operation.payment({destination:borrower.publicKey(),asset:bondAsset,amount:'120'}),false);
for(const name of ['repaid','cancelled','liquidated']){
 const v=e.loans[name]??={};
 v.id=await invoke('create_'+name,operator,book,'create_vault',[bytes(salt(name)),sym('C3_DEMO'),a(borrower.publicKey()),a(lender.publicKey()),i(40n*unit),i(20n*unit)]);
 v.delivery=(await read(book,'get_vault',[a(v.id)])).delivery;save();
 for(const [suffix,id] of [['main',v.id],['delivery',v.delivery]])await invoke('authorize_'+name+'_'+suffix,issuer,rules,'set_authorized',[a(bond),a(id),bool(true)]);
 await invoke('deposit_'+name,borrower,v.id,'deposit',[i(40n*unit)]);
 if(!v.escrow){const d=await tw('tw_deploy_'+name,'/deployer/single-release',{signer:operator.publicKey(),engagementId:'c3b-'+name+'-'+e.salts[name].slice(0,12),title:'Rendaval C3b '+name,description:'USDC escrow to loan vault',roles:{serviceProvider:operator.publicKey(),receiver:v.id,approver:lender.publicKey(),platformAddress:operator.publicKey(),releaseSigner:operator.publicKey(),disputeResolver:operator.publicKey()},amount:20,platformFee:0,milestones:[{description:'RBOND deposited in loan vault'}],trustline:{address:usdAsset.getIssuer(),symbol:'USDC'}},operator);v.escrow=Array.isArray(d)?d[0]:d;save();}
 await spend('tw_fund_'+name,20n*unit,()=>tw('tw_fund_'+name,'/escrow/single-release/fund-escrow',{contractId:v.escrow,signer:lender.publicKey(),amount:20},lender));
 if(name==='cancelled'){
   await tw('tw_dispute','/escrow/single-release/dispute-escrow',{contractId:v.escrow,signer:lender.publicKey()},lender);
   await tw('tw_refund','/escrow/single-release/resolve-dispute',{contractId:v.escrow,disputeResolver:operator.publicKey(),distributions:[{address:lender.publicKey(),amount:20}]},operator);
   await invoke('cancel',borrower,book,'cancel',[a(v.id),a(borrower.publicKey())]);
   await invoke('return_cancelled_bonds',operator,v.id,'collect_bonds');
   await invoke('refund_cancelled_vault',operator,v.id,'refund_usdc');
   v.state=await read(v.id,'get_config');save();continue;
 }
 for(const [step,k,body] of [
  ['change-milestone-status',operator,{milestoneIndex:'0',newEvidence:'Real RBOND balance verified',newStatus:'completed',serviceProvider:operator.publicKey()}],
  ['approve-milestone',lender,{milestoneIndex:'0',approver:lender.publicKey()}],
  ['release-funds',operator,{releaseSigner:operator.publicKey()}]])
   await tw('tw_'+step+'_'+name,'/escrow/single-release/'+step,{contractId:v.escrow,...body},k);
 if(!v.netReceived){v.netReceived=await read(usd,'balance',[a(v.id)]);assert.equal(v.netReceived,199400000n);save();}
 await invoke('open_'+name,borrower,book,'open',[a(v.id),sym('C3_DEMO'),a(borrower.publicKey()),a(lender.publicKey()),i(40n*unit),i(20n*unit)]);
 if(name==='repaid'){
   await invoke('repay',borrower,book,'repay',[a(v.id)]);
 }else{
   await invoke('approve_liquidation_buyer',issuer,book,'set_buyer',[a(buyer.publicKey()),bool(true)]);
   for(const price of [7500000n,5625000n]){
     if(!e.transactions.some(x=>x.label==='price_'+price)){const s=await read(book,'get_series',[sym('C3_DEMO')]);await waitUntil(BigInt(s.changed_at)+30n);}
     await invoke('price_'+price,issuer,book,'publish_price',[sym('C3_DEMO'),i(price)]);
   }
   await invoke('default',operator,book,'mark_default',[a(v.id)]);
   if(!v.defaulted){v.defaulted=await read(book,'get_loan',[a(v.id)]);save();}
   if(Number((await server.getLatestLedger()).closeTime)<Number(v.defaulted.loan.defaulted_at)+60) await reject('cure_window',buyer,book,'liquidate',[a(v.id),a(buyer.publicKey()),i(5625000n)]);
   await waitUntil(BigInt(v.defaulted.loan.defaulted_at)+60n);
   await invoke('liquidate',buyer,book,'liquidate',[a(v.id),a(buyer.publicKey()),i(5625000n)]);
 }
 v.final=await read(book,'get_loan',[a(v.id)]);
 assert.equal(v.final.loan.status[0],name==='repaid'?'Repaid':'Liquidated');
 assert.equal(await read(bond,'balance',[a(v.id)]),0n);
 assert.equal(await read(rules,'pledged',[a(bond),a(v.id)]),false);
 assert.equal(await read(rules,'pledged',[a(bond),a(v.delivery)]),false);save();
}
// Return all demo balances; fixed deterministic accounts are recoverable after interruption.
for(const [name,k] of [['borrower',borrower],['buyer',buyer]]){
 const bondBal=await read(bond,'balance',[a(k.publicKey())]);
 if(bondBal>0n)await submit('retire_'+name+'_bonds',k,Operation.payment({destination:issuer.publicKey(),asset:bondAsset,amount:decimal(bondBal)}),false);
 const balance=await read(usd,'balance',[a(k.publicKey())]);
 if(balance>0n)await transfer('return_'+name+'_usdc',k,lender.publicKey(),balance);
}
e.final={lender:await read(usd,'balance',[a(lender.publicKey())]),bookUsdc:await read(usd,'balance',[a(book)]),livePledges:await read(rules,'live_pledges'),rules:await read(rules,'get_config')};
assert.equal(e.final.livePledges,0n);assert.equal(e.final.bookUsdc,0n);
for(const k of [borrower,buyer]){assert.equal(await read(usd,'balance',[a(k.publicKey())]),0n);assert.equal(await read(bond,'balance',[a(k.publicKey())]),0n);assert.equal(await read(book,'claimable',[a(k.publicKey())]),0n);}
assert.equal(await read(book,'claimable',[a(lender.publicKey())]),0n);
e.completed=new Date().toISOString();save();console.log('C3b real runs complete; verify events and net funding independently.');
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});

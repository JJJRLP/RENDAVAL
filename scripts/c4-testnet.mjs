// Real testnet only. Every TW mutation is built and sent through its API.
// Public hash journal makes stages resumable; ephemeral keys are derived only in memory.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {Address,Asset,Contract,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,rpc,scValToNative,StrKey} from '@stellar/stellar-sdk';
const file='scripts/evidence/c4-testnet.json', server=new rpc.Server('https://soroban-testnet.stellar.org');
const operator=Keypair.fromSecret(process.env.VAULT_SECRET_KEY),issuer=Keypair.fromSecret(process.env.BOND_ISSUER_SECRET_KEY),lender=Keypair.fromSecret(process.env.LENDER_SECRET_KEY);
const ephemeral=role=>Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY).update('rendaval-c3b-testnet-v1-'+role).digest());
const borrower=ephemeral('borrower'),buyer=ephemeral('buyer'),keys=[operator,issuer,lender,borrower,buyer];
const rules='CCLLGSFJ2TOS22SH644XPL4Z7HLZJRPSJBFQII3VXT6T6745NUZ5HUKC',oldBook='CAC2Y7NO6NVBOSLAKHUQKIIZ5RIIAYXUGRKRB64JPYPPSM2KZQPBPKJA';
const bondAsset=new Asset('RBOND',issuer.publicKey()),usdAsset=new Asset('USDC','GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const bond=bondAsset.contractId(Networks.TESTNET),usd=usdAsset.contractId(Networks.TESTNET);
const a=s=>new Address(s).toScVal(),i=n=>nativeToScVal(BigInt(n),{type:'i128'}),u=n=>nativeToScVal(n,{type:'u32'}),u64=n=>nativeToScVal(BigInt(n),{type:'u64'}),sym=s=>nativeToScVal(s,{type:'symbol'}),bytes=b=>nativeToScVal(b);
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
let e=existsSync(file)?JSON.parse(readFileSync(file)):{phase:'C4',network:'TESTNET',startedAt:new Date().toISOString(),operator:operator.publicKey(),issuer:issuer.publicKey(),lender:lender.publicKey(),borrower:borrower.publicKey(),buyer:buyer.publicKey(),rulesContractId:rules,oldBook,bondToken:bond,usdc:usd,transactions:[],salts:{},loans:{},checks:[],grossLenderSpend:'0'};
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
async function deploy(name,filename,args){const wasm=readFileSync(`contracts/target/wasm32v1-none/release/${filename}.wasm`),hash=createHash('sha256').update(wasm).digest();e.wasm??={};if(e.wasm[name])assert.equal(e.wasm[name].sha256,hash.toString('hex'),'Code changed after deployment');e.wasm[name]={sha256:hash.toString('hex'),bytes:wasm.length};save();await submit('upload_'+name,operator,Operation.uploadContractWasm({wasm}));if(!args)return hash;return submit('deploy_'+name,operator,Operation.createCustomContract({address:new Address(operator.publicKey()),wasmHash:hash,salt:salt(name),constructorArgs:args}));}
async function main(){
 assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
 e.initial ??= { rules:await read(rules,'get_config'), livePledges:await read(rules,'live_pledges'), lender:await read(usd,'balance',[a(lender.publicKey())]) }; save();
 console.log('Live pledges:',String(await read(rules,'live_pledges')));
 if(process.argv.includes('--inspect')) return;
 if(process.argv.includes('--rounding')) {
  const principal=10000001n;
  e.grossLenderSpend=principal.toString();save();
  const id=await invoke('rounding_vault',operator,oldBook,'create_vault',[bytes(salt('rounding')),sym('C3_DEMO'),a(borrower.publicKey()),a(lender.publicKey()),i(2n*principal),i(principal)]);
  const d=await tw('rounding_deploy','/deployer/single-release',{signer:operator.publicKey(),engagementId:'c4-rounding-'+e.salts.rounding.slice(0,12),title:'C4 rounding verification',description:'Uneven USDC amount',roles:{serviceProvider:operator.publicKey(),receiver:id,approver:lender.publicKey(),platformAddress:operator.publicKey(),releaseSigner:operator.publicKey(),disputeResolver:operator.publicKey()},amount:1.0000001,platformFee:0,milestones:[{description:'Rounding test'}],trustline:{address:usdAsset.getIssuer(),symbol:'USDC'}},operator);
  const escrow=Array.isArray(d)?d[0]:d;
  await tw('rounding_fund','/escrow/single-release/fund-escrow',{contractId:escrow,signer:lender.publicKey(),amount:1.0000001},lender);
  for(const [step,k,body] of [
   ['change-milestone-status',operator,{milestoneIndex:'0',newEvidence:'Uneven release verification',newStatus:'completed',serviceProvider:operator.publicKey()}],
   ['approve-milestone',lender,{milestoneIndex:'0',approver:lender.publicKey()}],
   ['release-funds',operator,{releaseSigner:operator.publicKey()}]])
    await tw('rounding_'+step,'/escrow/single-release/'+step,{contractId:escrow,...body},k);
  if(!e.rounding) {const received=await read(usd,'balance',[a(id)]);e.rounding={principal,received,fee:principal-received,id,escrow};save();}
  await invoke('rounding_cancel',lender,oldBook,'cancel',[a(id),a(lender.publicKey())]);
  await invoke('rounding_return',operator,id,'refund_usdc');
  console.log('Rounding:',json(e.rounding)); return;
 }
 assert.equal(await read(rules,'live_pledges'),0n,'Close existing loans before replacement');
 const hash=await deploy('vault','rendaval_loan_vault');
 e.intermediateBook ??= e.contractId; e.intermediateBookWasm ??= e.wasm.book;save();
 e.contractId=await deploy('book_final','rendaval_loan_book',[a(operator.publicKey()),a(issuer.publicKey()),a(usd),a(rules),u(7000),u(8500),u(2500),u64(86400),u(500),u(30),u64(30),u64(60)]);save();
 e.wasm.book=e.wasm.book_final;save();
 e.registry=await deploy('registry','rendaval_app_registry',[a(operator.publicKey())]);save();
 await invoke('pin_vault_code_final',operator,e.contractId,'set_vault_code',[bytes(hash)]);
 await invoke('replace_book_final',operator,rules,'replace_book',[a(e.contractId)]);
 assert.equal((await read(rules,'get_config')).book,e.contractId);
 assert.equal(await read(bond,'admin'),rules);
 assert.equal(await read(e.registry,'get_operator'),operator.publicKey());
 e.deployed=new Date().toISOString();save(); console.log('Deployed',e.contractId,e.registry);
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});

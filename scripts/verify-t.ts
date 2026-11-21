import { evidenceFile, campaignSeed } from './t-config.mjs';
// Testnet only. No private keys or signed envelopes are persisted.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Keypair, Networks, Operation, TransactionBuilder, rpc, scValToNative, StrKey } from '@stellar/stellar-sdk';
import { handle, dispatch, type Action } from '../lib/server/loan/route';
import { a, balance, BOND, BOOK, bool, i, invoke as chainInvoke, issuerKey, prepare, raw, read, rpcServer, RULES, sym, UNIT, USD, apiCall } from '../lib/server/loan/chain';
import { bondAsset, dollarAsset, lenderKey, server } from '../lib/server/loan/network';
import { vaultKey, ApiError } from '../lib/server/env';
import { attest } from '../lib/server/attestation';
import { get, json } from '../lib/server/loan/store';
import { index } from '../lib/server/loan/records';
import { observeTransactions } from '../lib/server/loan/audit';
import type { Spec, VaultConfig, View } from '../lib/server/loan/types';
const invoke: typeof chainInvoke = (label,...args) => chainInvoke(campaignSeed(label),...args);
const file = evidenceFile('failures');
const company = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update(campaignSeed('phase-t-failures-v1')).digest());
const stranger = Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update(campaignSeed('phase-t-stranger-v1')).digest());
const wallet = company.publicKey();
type Row = { name: string; status: 'PASS' | 'FAIL'; evidence?: unknown; error?: string };
type Evidence = { wallet: string; steps: Record<string, unknown>; cases: Row[]; transactions: {label: string; hash: string}[]; grossReserved: string; budget?: Record<string,string>; before?: string; after?: string; completed?: string };
const e: Evidence = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {wallet, steps: {}, cases: [], transactions: [], grossReserved: '246'};
assert.equal(e.wallet, wallet);
function save() { const s = json(e); assert(!/\bS[A-Z2-7]{55}\b/.test(s)); writeFileSync(file, s+'\n'); }
observeTransactions((label, hash) => { if (!e.transactions.some(t => t.hash === hash)) e.transactions.push({label, hash}); save(); });
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> { if (name in e.steps) return e.steps[name] as T; console.log(name); const result = await fn(); e.steps[name] = result; save(); return result; }
function reserve(label:string,amount:bigint){e.budget??={};e.budget[label]??=amount.toString();const gross=Object.values(e.budget).reduce((n,v)=>n+BigInt(v),0n);assert(gross<=246n*UNIT,'Suite gross budget');assert(gross+157n*UNIT<=500n*UNIT,'Phase T gross budget');save();}
async function test(name: string, fn: () => Promise<unknown>) {
  if (e.cases.some(c => c.name === name && c.status === 'PASS')) return;
  try { const evidence = await fn(); e.cases.push({name, status:'PASS', evidence}); }
  catch (error) { e.cases.push({name, status:'FAIL', error: error instanceof Error ? error.message.slice(0,800) : 'Error'}); save(); throw error; }
  save();
}
const originalFetch = globalThis.fetch;
let actor = wallet;
let faultPath = '', faultMode: 'error' | 'timeout' | 'lost' = 'error', faultHits = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://server.api.pollar.xyz/v3/tokens/verify') return Response.json({code:'SERVER_TOKEN_VERIFIED',content:{network:'testnet',wallet:{address:actor,network:'STELLAR'}}});
  if (faultPath && url.includes('dev.api.trustlesswork.com') && url.includes(faultPath)) { if(faultMode==='lost'){if(faultHits===0){faultHits++;const response=await originalFetch(input,init);assert(response.ok);throw new DOMException('Synthetic response lost after real send','TimeoutError');}return originalFetch(input,init);} faultHits++; if (faultMode === 'timeout') throw new DOMException('Synthetic boundary timeout','TimeoutError'); return Response.json({message:'Synthetic boundary failure'}, {status:503}); }
  return originalFetch(input, init);
};
async function route(action: Action, body: Record<string,unknown> = {}) { const r = await handle(new Request('http://localhost/api/loan/'+action,{method: action === 'state' ? 'GET' : 'POST',headers:{Authorization:'Bearer phase-t', 'Content-Type':'application/json'},...(action === 'state' ? {} : {body:JSON.stringify(body)})}),action); return {status:r.status, body:await r.json()}; }
function spanish(body: {error?: string}) { assert(body.error); assert(!/HostError|Error\(Contract|Diagnostic|Wasm|Storage,|InvalidAction|Synthetic|Error:/.test(body.error),body.error); assert(/[áéíóúñ]|\b(No|El|La|Los|Compruebe|Prepare|Seleccione|Este|Verifique|Deposite|Complete|Falta|Renueve|Reintente)\b/.test(body.error),body.error); }
async function refused(action: Action, body: Record<string,unknown>, expected = 409) { const r = await route(action,body); assert.equal(r.status,expected,json(r)); spanish(r.body); return r; }
async function snapshot(id: string) {
  const [vault,bonds,usd,companyBonds,companyUsd,lenderUsd]=await Promise.all([read(id,'get_config'),balance(BOND,id),balance(USD,id),balance(BOND,wallet),balance(USD,wallet),balance(USD,lenderKey().publicKey())]);
  return json({vault,bonds,usd,companyBonds,companyUsd,lenderUsd});
}
async function rejectSimulation(name: string, id: string, fn: () => Promise<unknown>) { await test(name, async () => { const before = await snapshot(id); let message = ''; try {await fn();} catch(error) {assert(error instanceof ApiError); message=error.message; spanish({error:message});} assert(message,'Expected refusal'); assert.equal(await snapshot(id),before); return {mode:'real RPC simulation; not submitted',message,unchanged:JSON.parse(before)}; }); }
async function signed(id: string, action: 'deposit'|'open'|'repay'|'collect'|'claim', beforeSend?: () => Promise<void>) {
  const r = await route(`${action}/build`,{contractId:id}); assert.equal(r.status,200,json(r)); if(r.body.completed) return r.body;
  const balances = async () => {const [bonds,usd,lender]=await Promise.all([balance(BOND,wallet),balance(USD,wallet),balance(USD,lenderKey().publicKey())]);return json({bonds,usd,lender});};
  await test(action+' wrong signer and tampered transaction',async()=>{
    const before=await balances();
    const wrong=TransactionBuilder.fromXDR(r.body.unsignedTransaction,Networks.TESTNET);wrong.sign(stranger);
    const badSigner=await refused(`${action}/submit`,{contractId:id,signedXdr:wrong.toXDR()},400);
    const tampered=TransactionBuilder.cloneFrom(TransactionBuilder.fromXDR(r.body.unsignedTransaction,Networks.TESTNET) as import('@stellar/stellar-sdk').Transaction).addOperation(Operation.manageData({name:'tampered',value:'T'})).build();tampered.sign(company);
    const badBody=await refused(`${action}/submit`,{contractId:id,signedXdr:tampered.toXDR()},400);
    assert.equal(await balances(),before);return {badSigner,badBody};
  });
  if(beforeSend) await beforeSend();
  const tx=TransactionBuilder.fromXDR(r.body.unsignedTransaction,Networks.TESTNET);tx.sign(company);
  const originalSend=rpcServer.sendTransaction.bind(rpcServer);let lost=0;
  if(action==='deposit') rpcServer.sendTransaction=async(candidate)=>{const result=await originalSend(candidate);if(Buffer.from(candidate.hash()).equals(Buffer.from(tx.hash())) && lost===0){lost++;throw Error('Synthetic RPC response lost after real send');}return result;};
  let result;
  try{result=await route(`${action}/submit`,{contractId:id,signedXdr:tx.toXDR()});}finally{rpcServer.sendTransaction=originalSend;}
  assert.equal(result.status,200,json(result));
  if(action==='deposit') await test('RPC response lost after deposit submission recovers by hash',async()=>{assert.equal(lost,1);return {hash:result.body.hash,lostResponses:lost};});
  await test(action+' replay returns same hash without balance changes',async()=>{const before=await balances();const replay=await route(`${action}/submit`,{contractId:id,signedXdr:tx.toXDR()});assert.equal(replay.status,200,json(replay));assert.equal(replay.body.hash,result.body.hash);assert.equal(await balances(),before);return replay;});
  return result.body;
}
async function move(id: string,target:number) { for(let n=0;n<40;n++){ const r=await dispatch(wallet,'price',{contractId:id,price:target}) as {status:string;retryAfter?:number}; if(r.status==='complete')return r; await new Promise(r=>setTimeout(r,5000)); }throw Error('Price timeout'); }
async function main(){
  const journeys=JSON.parse(readFileSync(evidenceFile('journeys'),'utf8'));
  assert(journeys.completed && Number(journeys.grossLenderSpend)<=157,'Complete both phase T journeys first; their gross spend must be at most 157 USDC');
  e.before ??= (await balance(USD,lenderKey().publicKey())).toString(); save();
  // Across phase T: journeys <= 157 + this suite <= 246; no automatic funding outside these reservations.
  assert(Number(e.grossReserved)+157 < 500);
  for(const [name,key] of [['company',company],['stranger',stranger]] as const){
    await step(name+'-friendbot',async()=>{try{await server.loadAccount(key.publicKey());return {existing:true};}catch{const r=await originalFetch('https://friendbot.stellar.org/?addr='+key.publicKey());assert(r.ok);const b=await r.json();return {hash:b.hash??b.transaction_hash};}});
    await step(name+'-trustlines',async()=>{const tx=new TransactionBuilder(await server.loadAccount(key.publicKey()),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(Operation.changeTrust({asset:bondAsset()})).addOperation(Operation.changeTrust({asset:dollarAsset()})).setTimeout(120).build();tx.sign(key);const r=await server.submitTransaction(tx);return {hash:r.hash};});
    await step(name+'-kyb',()=>attest(key.publicKey(),'phase-t-'+name));
  }
  const b=await step('declare',()=>dispatch(wallet,'register',{bond:{issuer:'Pruebas T',series:'cura',nominal:100,currency:'USD',coupon:7,maturity:'2028-12-31'},certificateHash:createHash('sha256').update('phase-t-cure').digest('hex')})) as {id:string;series:string};
  await test('declaration requires approval',()=>refused('accept',{bondId:b.id}));
  await step('approve',()=>dispatch(wallet,'approve',{bondId:b.id}));
  await test('approval and issuance retry preserves balance and hashes',async()=>{const before=await balance(BOND,wallet);const result=await dispatch(wallet,'approve',{bondId:b.id});assert.deepEqual(result,e.steps.approve);assert.equal(await balance(BOND,wallet),before);return result;});
  const v=await step('accept',()=>dispatch(wallet,'accept',{bondId:b.id})) as {contractId:string}; const id=v.contractId;
  const spec=await read<Spec>(BOOK,'get_vault',[a(id)]);
  await test('accept retry deploys exactly one vault',async()=>{const r=await dispatch(wallet,'accept',{bondId:b.id}) as {contractId:string};assert.equal(r.contractId,id);return r;});
  await rejectSimulation('never-approved company cannot receive bonds',id,()=>prepare(issuerKey().publicKey(),BOND,'transfer',[a(issuerKey().publicKey()),a(stranger.publicKey()),i(1n)]));
  await rejectSimulation('transfer to unapproved account',id,()=>prepare(wallet,BOND,'transfer',[a(wallet),a(stranger.publicKey()),i(1n)]));
  for(const [name,key] of [['unapproved issuance',issuerKey()],['unapproved transfer',company]] as const){
    await test(name+' submitted to testnet',async()=>{const before=await snapshot(id);const tx=new TransactionBuilder(await server.loadAccount(key.publicKey()),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(Operation.payment({destination:stranger.publicKey(),asset:bondAsset(),amount:'0.0000001'})).setTimeout(120).build();tx.sign(key);let codes:unknown;try{await server.submitTransaction(tx);}catch(error){codes=(error as {response?:{data?:{extras?:{result_codes?:unknown}}}}).response?.data?.extras?.result_codes;}assert.deepEqual(codes,{transaction:'tx_failed',operations:['op_not_authorized']});assert.equal(await snapshot(id),before);return {hash:Buffer.from(tx.hash()).toString('hex'),codes};});
  }
  await test('fund without collateral',()=>refused('fund',{contractId:id}));
  await test('open without release',()=>refused('open/build',{contractId:id}));
  await rejectSimulation('open missing collateral and dollars',id,()=>prepare(wallet,BOOK,'open',[a(id),sym(spec.series),a(wallet),a(spec.lender),i(spec.face),i(spec.principal)]));
  await test('signed deposit not submitted leaves pending and no collateral',async()=>{const r=await route('deposit/build',{contractId:id});assert.equal(r.status,200);const tx=TransactionBuilder.fromXDR(r.body.unsignedTransaction,Networks.TESTNET);tx.sign(company);assert.equal(await balance(BOND,id),0n);assert.equal((await read<VaultConfig>(id,'get_config')).state[0],'Pending');return {signedHash:Buffer.from(tx.hash()).toString('hex'),state:await read(id,'get_config')};});
  await step('deposit',()=>signed(id,'deposit'));
  await rejectSimulation('open with bonds but no dollars',id,()=>prepare(wallet,BOOK,'open',[a(id),sym(spec.series),a(wallet),a(spec.lender),i(spec.face),i(spec.principal)]));
  reserve('cure-fund',50n*UNIT);
  for(const [name,path,mode] of [['TW deploy error','/deployer/single-release','error'],['deployed not funded','/fund-escrow','timeout'],['funded not released','/change-milestone-status','error']] as const){
    await test(name,async()=>{const lenderBefore=await balance(USD,lenderKey().publicKey());faultPath=path;faultMode=mode;faultHits=0;let r;try{r=await refused('fund',{contractId:id},502);}finally{faultPath='';}assert(faultHits>0);const escrow=await get<{id:string}>(`escrow:${id}`);const escrowBalance=escrow?await balance(USD,escrow.id):null;assert.equal(escrowBalance,name==='TW deploy error'?null:name==='deployed not funded'?0n:50n*UNIT);assert.equal(await balance(USD,id),0n);assert.equal(await balance(BOND,id),100n*UNIT);assert.equal((await read<VaultConfig>(id,'get_config')).state[0],'Pending');assert.equal(lenderBefore-await balance(USD,lenderKey().publicKey()),name==='funded not released'?50n*UNIT:0n);return {...r,escrow,escrowBalance:escrowBalance?.toString(),vault:await read(id,'get_config')};});
  }
  await step('fund',async()=>{faultPath='/helper/send-transaction';faultMode='lost';faultHits=0;let result;try{result=await dispatch(wallet,'fund',{contractId:id});}finally{faultPath='';}await test('TW response lost after real submission resumes by hash',async()=>{assert.equal(faultHits,1);return result;});return result;});
  await test('released not opened retry does not redeploy or repay',async()=>{const before=await snapshot(id);const escrow=await get(`escrow:${id}`);const r=await dispatch(wallet,'fund',{contractId:id});assert.equal(await snapshot(id),before);assert.deepEqual(await get(`escrow:${id}`),escrow);assert.equal((await read<VaultConfig>(id,'get_config')).state[0],'Pending');return r;});
  await step('open',()=>signed(id,'open'));
  await rejectSimulation('issuer cannot freeze live vault',id,()=>prepare(issuerKey().publicKey(),RULES,'set_authorized',[a(BOND),a(id),bool(false)]));
  await rejectSimulation('same vault cannot be opened twice',id,()=>prepare(wallet,BOOK,'open',[a(id),sym(spec.series),a(wallet),a(spec.lender),i(spec.face),i(spec.principal)]));
  await test('healthy loan refuses default with Spanish message',async()=>{const before=await snapshot(id);const r=await refused('default',{contractId:id});assert.equal(await snapshot(id),before);return r;});
  await test('repay insufficient dollars',async()=>{const before=await snapshot(id);const r=await refused('repay/build',{contractId:id});assert.equal(await snapshot(id),before);return r;});
  await rejectSimulation('price step larger than 25 percent',id,()=>prepare(issuerKey().publicKey(),BOOK,'publish_price',[sym(spec.series),i(5000000n)]));
  await test('RPC error and timeout return Spanish, retry reads real state',async()=>{const original=rpcServer.getLatestLedger;const outcomes=[];try{for(const message of ['Synthetic RPC error','Synthetic RPC timeout']){rpcServer.getLatestLedger=async()=>{throw Error(message);};outcomes.push(await refused('price',{contractId:id,price:1},502));}}finally{rpcServer.getLatestLedger=original;}const r=await dispatch(wallet,'price',{contractId:id,price:1});return {outcomes,retry:r};});
  await test('price change before real interval is refused',async()=>{
    const old=await read<{quote:{price:bigint}}>(BOOK,'get_series',[sym(spec.series)]);const next=old.quote.price===9900000n?9800000n:9900000n;const tooSoon=next===9900000n?9800000n:9900000n;
    const tx=await prepare(issuerKey().publicKey(),BOOK,'publish_price',[sym(spec.series),i(next)]);tx.sign(issuerKey());
    const hash=Buffer.from(tx.hash()).toString('hex');e.transactions.push({label:'t-price-interval',hash});save();await rpcServer.sendTransaction(tx);
    for(let n=0;n<20;n++){const r=await rpcServer.getTransaction(hash);if(r.status==='SUCCESS')break;assert.notEqual(r.status,'FAILED');await new Promise(r=>setTimeout(r,1000));}
    let message='';try{await prepare(issuerKey().publicKey(),BOOK,'publish_price',[sym(spec.series),i(tooSoon)]);}catch(error){assert(error instanceof ApiError);message=error.message;spanish({error:message});}assert(message,'Expected interval refusal');
    const quote=await read<{quote:{price:bigint}}>(BOOK,'get_series',[sym(spec.series)]);assert.equal(quote.quote.price,next);return {hash,message,price:quote.quote.price.toString(),mode:'real publication followed by RPC simulation rejection'};
  });
  await step('margin-below',()=>move(id,0.72));
  await test('below 70 percent is healthy',async()=>{const r=await read<View>(BOOK,'get_loan',[a(id)]);assert(r.health_bps!<7000n);assert.equal(r.loan.status[0],'Active');return r;});
  await step('margin-above',()=>move(id,0.71));
  await test('above 70 percent enters margin',async()=>{const r=await read<View>(BOOK,'get_loan',[a(id)]);assert(r.health_bps!>=7000n);assert.equal(r.loan.status[0],'Margin');return r;});
  await step('default-below',()=>move(id,0.60));
  await test('below 85 percent refuses default',()=>refused('default',{contractId:id}));
  await step('default-above',()=>move(id,0.59));
  reserve('topup',4833334n);
  await step('topup',()=>dispatch(wallet,'repay/topup',{contractId:id}));
  await step('cure-repay',()=>signed(id,'repay',async()=>{
    await step('default',()=>dispatch(wallet,'default',{contractId:id}));
    await test('execution before cure waits',async()=>{const r=await route('liquidate',{contractId:id});assert.equal(r.status,200);assert.equal(r.body.status,'waiting');return r;});
  }));
  await test('default cured by repayment returns bonds',async()=>{const r=await read<View>(BOOK,'get_loan',[a(id)]);assert.equal(r.loan.status[0],'Repaid');const h=await server.transactions().transaction((e.steps['cure-repay'] as {hash:string}).hash).call();assert(Date.parse(h.created_at)/1000 <= (e.steps.default as {cureDeadline:number}).cureDeadline,'Repayment must confirm within cure window');assert.equal(await balance(BOND,id),0n);assert.equal(await balance(BOND,wallet),100n*UNIT);return r;});
  await test('second repayment does not pay twice',async()=>{const before=await snapshot(id);const r=await signed(id,'repay');assert.equal(r.completed,true);assert.equal(await snapshot(id),before);return r;});
  await test('foreign company rejected on all ownership routes',async()=>{actor=stranger.publicKey();const results=[];try{for(const action of ['approve','accept','fund','price','default','liquidate','deposit/build','deposit/submit','open/build','open/submit','repay/build','repay/submit','repay/topup','collect/build','collect/submit'] as const)results.push({action,...await refused(action,{contractId:id,bondId:b.id,signedXdr:'invalid',price:1},403)});}finally{actor=wallet;}return results;});
  await step('claim',()=>signed(wallet,'claim'));
  await test('non-publisher signed transaction fails on chain',async()=>{
    const before=await read(BOOK,'get_series',[sym(spec.series)]);
    const tx=await raw(stranger.publicKey(),BOOK,'publish_price',[sym(spec.series),i(5900000n)]);
    const sim=await rpcServer.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(sim));
    const prepared=rpc.assembleTransaction(tx,sim).build();prepared.sign(stranger);
    const hash=Buffer.from(prepared.hash()).toString('hex');
    const sent=await rpcServer.sendTransaction(prepared);
    for(let n=0;n<20;n++){const result=await rpcServer.getTransaction(hash);if(result.status==='FAILED'){assert.deepEqual(await read(BOOK,'get_series',[sym(spec.series)]),before);return {hash,status:result.status};}assert.notEqual(result.status,'SUCCESS');await new Promise(r=>setTimeout(r,1500));}
    throw Error('No confirmed failure for publisher transaction: '+sent.status+' '+hash);
  });
  // Build a funded escrow with absent collateral through the SAME API client/outbox as fund.
  // This recovery branch has no public route yet; the evidence states that limitation.
  const cb=await step('cancel-declare',()=>dispatch(wallet,'register',{bond:{issuer:'Pruebas T',series:'reembolso',nominal:100,currency:'USD',coupon:7,maturity:'2028-12-31'},certificateHash:createHash('sha256').update('phase-t-refund').digest('hex')})) as {id:string};
  await step('cancel-approve',()=>dispatch(wallet,'approve',{bondId:cb.id}));
  const cv=await step('cancel-accept',()=>dispatch(wallet,'accept',{bondId:cb.id})) as {contractId:string};
  const operator=vaultKey(), lender=lenderKey();
  const deployed=await step('refund-deploy',()=>apiCall('t-refund-deploy:'+cv.contractId,operator,'/deployer/single-release',{signer:operator.publicKey(),engagementId:'t-'+cv.contractId,title:'Rendaval phase T refund',description:'Missing collateral recovery',roles:{serviceProvider:operator.publicKey(),receiver:cv.contractId,approver:lender.publicKey(),platformAddress:operator.publicKey(),releaseSigner:operator.publicKey(),disputeResolver:operator.publicKey()},amount:50,platformFee:0,milestones:[{description:'RBOND depositado'}],trustline:{address:dollarAsset().issuer,symbol:'USDC'}}));
  const escrow=Array.isArray(deployed.value)?deployed.value[0]:deployed.value;assert.equal(typeof escrow,'string');
  reserve('refund-fund',50n*UNIT);
  await step('refund-fund',()=>apiCall('t-refund-fund:'+cv.contractId,lender,'/escrow/single-release/fund-escrow',{contractId:escrow,signer:lender.publicKey(),amount:50}));
  await test('collateral absent leaves escrow funded and loan pending',async()=>{assert.equal(await balance(BOND,cv.contractId),0n);assert.equal(await balance(USD,escrow as string),50n*UNIT);return {escrow,config:await read(cv.contractId,'get_config')};});
  await step('refund-dispute',()=>apiCall('t-dispute:'+cv.contractId,lender,'/escrow/single-release/dispute-escrow',{contractId:escrow,signer:lender.publicKey()}));
  await step('refund-before',async()=>({balance:(await balance(USD,lender.publicKey())).toString()}));
  await step('refund-resolve',()=>apiCall('t-resolve:'+cv.contractId,operator,'/escrow/single-release/resolve-dispute',{contractId:escrow,disputeResolver:operator.publicKey(),distributions:[{address:lender.publicKey(),amount:50}]}));
  await step('cancel',()=>invoke('t-cancel:'+cv.contractId,lender,BOOK,'cancel',[a(cv.contractId),a(lender.publicKey())]));
  await test('TW dispute refunds net to lender and cancels without debt',async()=>{assert.equal(await balance(USD,escrow as string),0n);assert.equal(await balance(USD,lender.publicKey())-BigInt((e.steps['refund-before'] as {balance:string}).balance),498500000n);assert.equal((await read<VaultConfig>(cv.contractId,'get_config')).state[0],'Closed');assert.equal(await balance(BOND,wallet),200n*UNIT);return {escrow,refund:e.steps['refund-resolve'],cancel:e.steps.cancel,bonds:(await balance(BOND,wallet)).toString()};});
  await test('refund and cancellation replay do not move money twice',async()=>{const before=await snapshot(cv.contractId);const r=await apiCall('t-resolve:'+cv.contractId,operator,'/escrow/single-release/resolve-dispute',{contractId:escrow,disputeResolver:operator.publicKey(),distributions:[{address:lender.publicKey(),amount:50}]});assert.equal(r.hash,(e.steps['refund-resolve'] as {hash:string}).hash);const c=await invoke('t-cancel:'+cv.contractId,lender,BOOK,'cancel',[a(cv.contractId),a(lender.publicKey())]);assert.equal(c.hash,(e.steps.cancel as {hash:string}).hash);assert.equal(await snapshot(cv.contractId),before);return {refund:r.hash,cancel:c.hash};});
  await test('cancelled setup is readable without inventing a debt',async()=>{const r=await route('state');assert.equal(r.status,200,json(r));const loan=r.body.allLoans.find((l:{id:string})=>l.id===cv.contractId);assert.equal(loan.status,'Cancelled');assert.equal(loan.view,null);assert.equal(loan.amounts.debt,'0');assert.equal(loan.amounts.net,'0');return {id:loan.id,status:loan.status,view:loan.view};});
  const eb=await step('execution-declare',()=>dispatch(wallet,'register',{bond:{issuer:'Pruebas T',series:'polvo-y-venta',nominal:100,currency:'USD',coupon:7,maturity:'2028-12-31'},certificateHash:createHash('sha256').update('phase-t-execute').digest('hex')})) as {id:string};
  await step('execution-approve',()=>dispatch(wallet,'approve',{bondId:eb.id}));
  const ev=await step('execution-accept',()=>dispatch(wallet,'accept',{bondId:eb.id})) as {contractId:string};
  await step('dust-authorize',()=>invoke('t-dust-authorize',issuerKey(),RULES,'set_authorized',[a(BOND),a(stranger.publicKey()),bool(true)]));
  await step('dust-bond-source',()=>invoke('t-dust-bond-source',company,BOND,'transfer',[a(wallet),a(stranger.publicKey()),i(1n)]));
  reserve('dust',1n);
  await step('dust-dollar-source',()=>invoke('t-dust-dollar-source',lender,USD,'transfer',[a(lender.publicKey()),a(stranger.publicKey()),i(1n)]));
  await step('dust-bond',()=>invoke('t-dust-bond',stranger,BOND,'transfer',[a(stranger.publicKey()),a(ev.contractId),i(1n)]));
  await step('dust-dollar',()=>invoke('t-dust-dollar',stranger,USD,'transfer',[a(stranger.publicKey()),a(ev.contractId),i(1n)]));
  await step('execution-deposit',()=>signed(ev.contractId,'deposit'));
  reserve('execution-fund',50n*UNIT);
  await step('execution-fund',()=>dispatch(wallet,'fund',{contractId:ev.contractId}));
  await step('execution-open',()=>signed(ev.contractId,'open'));
  await test('stranger dust in both tokens cannot block opening',async()=>{assert.equal(await balance(BOND,ev.contractId),100n*UNIT+1n);assert.equal(await balance(USD,ev.contractId),1n);const view=await read<View>(BOOK,'get_loan',[a(ev.contractId)]);assert.equal(view.loan.status[0],'Active');return {open:e.steps['execution-open'],view};});
  await step('execution-price',()=>move(ev.contractId,0.5625));
  await step('execution-default',()=>dispatch(wallet,'default',{contractId:ev.contractId}));
  const view=await read<View>(BOOK,'get_loan',[a(ev.contractId)]);
  await rejectSimulation('buyer without issuer approval cannot execute',ev.contractId,()=>prepare(stranger.publicKey(),BOOK,'liquidate',[a(ev.contractId),a(stranger.publicKey()),i(view.loan.default_price)]));
  // Create blocked delivery of the excess atom to exercise the new collect signature routes.
  await step('execution-block-borrower',()=>invoke('t-block-borrower',issuerKey(),RULES,'set_authorized',[a(BOND),a(wallet),bool(false)]));
  await step('execution-price-change',()=>move(ev.contractId,0.75));
  for(;;){const now=Number((await rpcServer.getLatestLedger()).closeTime);const deadline=(e.steps['execution-default'] as {cureDeadline:number}).cureDeadline;if(now>=deadline)break;await new Promise(r=>setTimeout(r,Math.min(5000,(deadline-now)*1000)));}
  await rejectSimulation('execution rejects price changed since quote',ev.contractId,()=>prepare(lender.publicKey(),BOOK,'liquidate',[a(ev.contractId),a(lender.publicKey()),i(view.loan.default_price)]));
  reserve('execution-buy',712500000n);
  await step('execute',()=>dispatch(wallet,'liquidate',{contractId:ev.contractId}));
  await test('liquidation has surplus and atomic payment and delivery',async()=>{
    const sold=await read<View>(BOOK,'get_loan',[a(ev.contractId)]);assert.equal(sold.loan.status[0],'Liquidated');assert(sold.loan.surplus>0n);assert.equal(sold.loan.loss,0n);assert.equal(await balance(BOND,ev.contractId),0n);
    const hash=(e.steps.execute as {hash:string}).hash;const tx=await rpcServer.getTransaction(hash);assert.equal(tx.status,'SUCCESS');
    assert(tx.status==='SUCCESS');
    const events=[...(tx.events?.contractEventsXdr??[]).flat(),...(tx.events?.transactionEventsXdr??[]).map(x=>x.event)];
    const transfers=events.flatMap(event=>{if(!event?.contractId)return [];const topics=event.body.v0.topics.map(scValToNative);if(topics[0]!=='transfer')return [];const data=scValToNative(event.body.v0.data);return [{token:StrKey.encodeContract(event.contractId.value),from:topics[1],to:topics[2],amount:String(typeof data==='bigint'?data:data.amount)}];});
    assert(transfers.some(t=>t.token===BOND&&t.from===ev.contractId&&t.to===lender.publicKey()&&t.amount==='1000000000'));
    assert(transfers.some(t=>t.token===USD&&t.from===lender.publicKey()&&t.to===BOOK&&t.amount===String(sold.loan.proceeds)));
    return {hash,sold,transfers};
  });
  await test('repayment after liquidation is refused',()=>refused('repay/build',{contractId:ev.contractId}));
  await step('execution-unblock-borrower',()=>invoke('t-unblock-borrower',issuerKey(),RULES,'set_authorized',[a(BOND),a(wallet),bool(true)]));
  const es=await read<Spec>(BOOK,'get_vault',[a(ev.contractId)]);
  await test('blocked excess bond is assigned to company delivery',async()=>{assert.equal(await balance(BOND,es.delivery),1n);return await read(es.delivery,'get_config');});
  await step('collect',()=>signed(ev.contractId,'collect'));
  await test('collect returns excess bond and replay does not duplicate',async()=>{assert.equal(await balance(BOND,es.delivery),0n);return {hash:(e.steps.collect as {hash:string}).hash};});
  await step('dust-refund',()=>invoke('t-dust-refund',lender,ev.contractId,'refund_usdc'));
  await test('cancelled compatibility terms contain no debt',async()=>{const r=await route('state');assert.equal(r.status,200,json(r));const loan=r.body.allLoans.find((l:{id:string})=>l.id===cv.contractId);for(const field of ['loan','interest','total','custodyFee'])assert.equal(loan.terms[field],0);assert.equal(loan.amounts.debt,'0');return {status:loan.status,terms:loan.terms,amounts:loan.amounts};});
  await test('recovery leaves exactly one vault per declaration',async()=>{const idx=await index(wallet);assert.equal(idx.loans.length,3);assert.deepEqual(idx.loans.map(l=>l.id).sort(),[id,cv.contractId,ev.contractId].sort());const creates=e.transactions.filter(t=>t.label.startsWith('create:'));assert.equal(creates.length,3);const escrows=e.transactions.filter(t=>t.label.startsWith('tw-deploy:')||t.label.startsWith('t-refund-deploy:'));assert.equal(escrows.length,3);return {ids:idx.loans.map(l=>l.id),creates,escrows};});
  await step('return-unused-suite-dollars',async()=>{const amount=await balance(USD,wallet);if(amount===0n)return {amount:'0'};return {...await invoke('t-return-unused-suite-dollars',company,USD,'transfer',[a(wallet),a(lender.publicKey()),i(amount)]),amount:amount.toString(),reason:'Return unused test funds after all loans closed'};});
  await step('return-unused-journey-dollars',async()=>{
    const journey=JSON.parse(readFileSync(evidenceFile('journeys'),'utf8'));assert(journey.completed);
    for(const name of ['repaid','liquidated']){const loan=await read<View>(BOOK,'get_loan',[a(journey.steps[name+'-accept'].contractId)]);assert(['Repaid','Liquidated'].includes(loan.loan.status[0]));}
    const owner=Keypair.fromRawEd25519Seed(createHash('sha256').update(process.env.VAULT_SECRET_KEY!).update(campaignSeed('rendaval-phase-t-company-v1')).digest());assert.equal(owner.publicKey(),journey.wallet);
    const amount=await balance(USD,owner.publicKey());if(amount===0n)return {amount:'0'};
    return {...await invoke('t-return-unused-journey-dollars',owner,USD,'transfer',[a(owner.publicKey()),a(lender.publicKey()),i(amount)]),amount:amount.toString(),reason:'Return unused test funds after both journeys closed'};
  });
  e.completed=new Date().toISOString();e.after=(await balance(USD,lender.publicKey())).toString();save();console.log('Phase T cases:',e.cases.length);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Failure');process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;});

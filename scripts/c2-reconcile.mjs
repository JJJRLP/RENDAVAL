// Read-only reconciliation of shared demo accounts; never loads keys or sends funds.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Address,Contract,Networks,TransactionBuilder,rpc,StrKey,scValToNative} from '@stellar/stellar-sdk';
const e=JSON.parse(readFileSync('scripts/evidence/loan-book-testnet.json'));
const r=new rpc.Server('https://soroban-testnet.stellar.org');
const own=new Set(e.transactions.map(t=>t.hash));
const first=e.transactions.find(t=>t.label==='approve_lender').ledger;
const runLastLedger=e.transactions.at(-1).ledger;
const last=(await r.getLatestLedger()).sequence;
const txs=new Map();
for(const address of [e.lender,e.borrower]) {
 let url=`https://horizon-testnet.stellar.org/accounts/${address}/transactions?order=desc&limit=200`;
 for (;;) {
  const resp=await fetch(url);if(!resp.ok)throw Error('Horizon '+resp.status);const page=await resp.json();
  const rows=page._embedded.records;
  for(const t of rows)if(t.ledger>=first&&t.ledger<=last)txs.set(t.hash,t);
  if(!rows.length||rows.at(-1).ledger<first)break;url=page._links.next.href;
 }
}
const movements=[];
for(const t of txs.values()) {
 const tx=await r.getTransaction(t.hash);if(tx.status!=='SUCCESS')continue;
 // Protocol 23 SAC events also expose classic transfers through transaction events.
 const events=[...(tx.events?.contractEventsXdr??[]).flat(),...(tx.events?.transactionEventsXdr??[]).map(x=>x.event)];
 const seen=new Set();
 for(const event of events) {
  if(!event?.contractId)continue;
  const id=StrKey.encodeContract(event.contractId.value);if(id!==e.usdc)continue;
  const topics=event.body.v0.topics.map(scValToNative);const data=scValToNative(event.body.v0.data);
  if(topics[0]!=='transfer')continue;
  const amount=typeof data==='bigint'?data:BigInt(data.amount);
  const from=topics[1],to=topics[2];
  if(![from,to].some(a=>a===e.lender||a===e.borrower))continue;
  const row={hash:t.hash,ledger:t.ledger,at:t.created_at,from,to,amount:amount.toString(),own:own.has(t.hash)};
  const key=JSON.stringify(row);if(!seen.has(key)){movements.push(row);seen.add(key);}
 }
}
const net={};
for(const role of ['lender','borrower']) {
 const address=e[role];const sum=ownOnly=>movements.filter(x=>x.own===ownOnly).reduce((n,x)=>n+(x.to===address?BigInt(x.amount):0n)-(x.from===address?BigInt(x.amount):0n),0n);
 net[role]={own:sum(true).toString(),external:sum(false).toString()};
}
const result={firstLedger:first,lastLedger:last,runLastLedger,movements:movements.sort((a,b)=>a.ledger-b.ledger),net};
writeFileSync('scripts/evidence/c2-reconciliation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({net,external:movements.filter(x=>!x.own)},null,2));

if(process.argv.includes('--finalize')) {
 const a=s=>new Address(s).toScVal();
 async function read(id,method,args=[]) {
  const tx=new TransactionBuilder(await r.getAccount(e.operator),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();
  const sim=await r.simulateTransaction(tx);assert(rpc.Api.isSimulationSuccess(sim),sim.error);return scValToNative(sim.result.retval);
 }
 assert(e.transactions.every(t=>t.status==='SUCCESS'));
 assert.equal(e.transactions.at(-1).label,'retire_lender_bonds');
 e.finalState={admin:await read(e.bondToken,'admin'),livePledges:await read(e.rulesContractId,'live_pledges'),bookUsdc:await read(e.usdc,'balance',[a(e.contractId)])};
 assert.equal(e.finalState.admin,e.rulesContractId);assert.equal(e.finalState.livePledges,0n);assert.equal(e.finalState.bookUsdc,0n);
 for(const [id,status] of [[e.escrow,'Repaid'],[e.escrow2,'Liquidated']]) {
  assert.equal((await read(e.contractId,'get_loan',[a(id)])).loan.status[0],status);
  assert.equal(await read(e.bondToken,'balance',[a(id)]),0n);
 }
 for(const role of ['lender','borrower']) {
  assert.equal(net[role].own,'0');
  e.finalState[role]=await read(e.usdc,'balance',[a(e[role])]);
  assert.equal(e.finalState[role],BigInt(e.initial[role].balance)+BigInt(net[role].external));
  assert.equal(await read(e.contractId,'claimable',[a(e[role])]),0n);
  const resp=await fetch(`https://horizon-testnet.stellar.org/accounts/${e[role]}`);assert(resp.ok);
  const line=(await resp.json()).balances.find(x=>x.asset_code==='USDC');assert.equal(line.limit,e.initial[role].limit);
 }
 e.grossLenderSpend=movements.filter(x=>x.own&&x.from===e.lender).reduce((n,x)=>n+BigInt(x.amount),0n);
 assert(e.grossLenderSpend<=300n*10000000n);
 e.reconciliation={file:'c2-reconciliation.json',firstLedger:first,lastLedger:last,runLastLedger,net};
 e.completed=new Date().toISOString();
 writeFileSync('scripts/evidence/loan-book-testnet.json',JSON.stringify(e,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n');
 console.log('Finalized with exact account reconciliation; no transactions sent');
}

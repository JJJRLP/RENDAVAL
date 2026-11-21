import { evidenceFile } from './t-config.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { balance, decimal, USD } from '../lib/server/loan/chain';
import { lenderKey } from '../lib/server/loan/network';
async function main(){
const path=evidenceFile('run');
const run=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{started:new Date().toISOString(),commands:[]};
const amount=decimal(await balance(USD,lenderKey().publicKey()));
if(process.argv.includes('--after')){run.after=amount;run.finished=new Date().toISOString();}
else run.before??=amount;
writeFileSync(path,JSON.stringify(run,null,2)+'\n');
console.log('Lender USDC:',amount);

}
main().catch(error=>{console.error(error instanceof Error?error.message:'Balance read failed');process.exitCode=1;});

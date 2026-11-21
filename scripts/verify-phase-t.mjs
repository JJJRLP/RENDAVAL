import { evidenceFile, campaignArgs } from './t-config.mjs';
// Single sequential entry point. Do not run another writer using these keys alongside it.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const path = evidenceFile('run');
let run = existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : { started: new Date().toISOString(), commands: [] };
const save = () => writeFileSync(path,JSON.stringify(run,null,2)+'\n');
function command(args) {
  args=[...args,...campaignArgs];
  return new Promise(resolve => {
    const child=spawn(process.execPath,args,{stdio:'inherit'});
    child.on('exit',code=>{run=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):run;run.commands.push({args,code,at:new Date().toISOString()});save();resolve(code);});
  });
}
const common=['--env-file=.env.local','--conditions=react-server','--import','tsx'];
if(await command([...common,'scripts/t-balance.ts'])!==0) process.exit(1);
for(const args of [
  [...common,'scripts/verify-b1.ts'],
  [...common,'scripts/verify-b1.ts','--phase-t'],
  [...common,'scripts/verify-b1-authorization.ts'],
  [...common,'scripts/verify-b1-authorization.ts','--phase-t'],
  [...common,'scripts/verify-t.ts'],
]) {
  if(await command(args)!==0){process.exitCode=1;break;}
}
if(await command([...common,'scripts/t-balance.ts','--after'])!==0) process.exitCode=1;
if(await command(['scripts/report-t.mjs'])!==0) process.exitCode=1;

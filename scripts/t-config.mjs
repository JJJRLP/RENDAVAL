// Public campaign identifier; never a key. Omit it to resume the original phase T.
export const campaign = process.argv.find(arg=>arg.startsWith('--campaign='))?.slice(11) ?? '';
if(campaign && !/^[a-z0-9-]{1,32}$/.test(campaign)) throw Error('Use --campaign con 1–32 letras minúsculas, números o guiones.');
export const campaignArgs = campaign ? ['--campaign='+campaign] : [];
export const evidenceFile = name => `scripts/evidence/t-${campaign ? campaign+'-' : ''}${name}.json`;
export const campaignSeed = seed => campaign ? seed+':'+campaign : seed;

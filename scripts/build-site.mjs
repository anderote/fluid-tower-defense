import {mkdir,copyFile,cp,writeFile,readFile} from 'node:fs/promises';
await mkdir('site-dist/server',{recursive:true});
await cp('dist','site-dist/client',{recursive:true});
const protocol=await readFile('scripts/coop-protocol.mjs','utf8');
const worker=await readFile('server/worker.mjs','utf8');
await writeFile('site-dist/server/index.js',protocol.replaceAll('export function','function')+'\n'+worker.replace("import {validRemoteCommand,validFrame} from '../scripts/coop-protocol.mjs';",''));
await writeFile('site-dist/server/wrangler.json',JSON.stringify({name:'pressure-front',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS'},r2_buckets:[{binding:'BUCKET',bucket_name:'pressure-front-rooms'}]}));
// Sites expects its Worker and static assets under dist/server and dist/client.
const {rm,rename}=await import('node:fs/promises');await rm('dist',{recursive:true});await rename('site-dist','dist');

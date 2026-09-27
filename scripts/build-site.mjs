import {mkdir,copyFile,cp,writeFile,readFile} from 'node:fs/promises';
await mkdir('site-dist/server',{recursive:true});
await cp('dist','site-dist/client',{recursive:true});
// Keep every track, but use a bandwidth-friendly mono encode for public hosting.
// Original local/offline assets are never changed.
const {readdir}=await import('node:fs/promises');
const {execFile}=await import('node:child_process');
const {promisify}=await import('node:util');
const run=promisify(execFile);
const music='site-dist/client/audio/red-alert';
const tracks=(await readdir(music)).filter(name=>name.endsWith('.mp3'));
for(let i=0;i<tracks.length;i+=4)await Promise.all(tracks.slice(i,i+4).map(name=>run('ffmpeg',['-nostdin','-v','error','-y','-i','public/audio/red-alert/'+name,'-map_metadata','-1','-ac','1','-ar','22050','-codec:a','libmp3lame','-b:a','32k',music+'/'+name])));
console.log(`Prepared ${tracks.length} compact web soundtrack tracks.`);
const protocol=await readFile('scripts/coop-protocol.mjs','utf8');
const worker=await readFile('server/worker.mjs','utf8');
await writeFile('site-dist/server/index.js',protocol.replaceAll('export function','function')+'\n'+worker.replace("import {validRemoteCommand,validFrame} from '../scripts/coop-protocol.mjs';",''));
await writeFile('site-dist/server/wrangler.json',JSON.stringify({name:'pressure-front',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS'},r2_buckets:[{binding:'BUCKET',bucket_name:'pressure-front-rooms'}]}));
// Sites expects its Worker and static assets under dist/server and dist/client.
const {rm,rename}=await import('node:fs/promises');await rm('dist',{recursive:true});await rename('site-dist','dist');

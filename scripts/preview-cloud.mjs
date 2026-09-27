import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import worker from '../server/worker.mjs';
import {MemoryBucket} from '../server/memory-bucket.mjs';
const root=resolve('dist'),port=Number(process.env.PORT||5205);
const env={BUCKET:new MemoryBucket(),ASSETS:{async fetch(request){try{const url=new URL(request.url);const path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root+'/')||!(await stat(path)).isFile())return new Response('Not found',{status:404});return new Response(await readFile(path),{headers:{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[extname(path)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}).listen(port,'127.0.0.1',()=>console.log(`Public relay preview: http://127.0.0.1:${port}`));

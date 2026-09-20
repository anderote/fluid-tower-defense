import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {pathToFileURL} from 'node:url';

const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.ico':'image/x-icon'};
export function createGameServer(home) {
  return createServer(async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname==='/__release'){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:await readFile(resolve(home,'current/release.json')));return;
      }
      const releasePath=pathname.startsWith('/releases/');
      const root=await realpath(resolve(home,releasePath?'releases':'current'));
      const relative=pathname==='/'?'index.html':pathname.slice(releasePath?'/releases/'.length:1);
      const candidate=resolve(root,relative);
      if(!candidate.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const file=await realpath(candidate);
      if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const info=await stat(file);
      if(!info.isFile()){res.writeHead(404);res.end();return;}
      const headers={'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(match&&(match[1]||match[2])){
          start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
          end=match[1]&&match[2]?Math.min(Number(match[2]),end):end;
        }else start=NaN;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length']=Math.max(0,end-start+1);
      res.writeHead(status,headers);
      if(req.method==='HEAD'||info.size===0){res.end();return;}
      const stream=createReadStream(file,{start,end});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('File unavailable');}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createGameServer(process.argv[2]);
  server.listen(Number(process.argv[3]??5173),'127.0.0.1',()=>console.log('Pressure Front: http://127.0.0.1:5173'));
}

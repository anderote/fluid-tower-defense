import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {randomBytes} from 'node:crypto';
const kinds=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator','crusher'];
export function validCommand(c){
 if(!c||typeof c!=='object')return false;
 if(c.type==='place')return kinds.includes(c.kind)&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1&&Number.isSafeInteger(c.frame);
 return ['start-wave','pause','slam-gates','dam-north','dam-south','dam-flood'].includes(c.type);
}
export function createLocalServer(root,{lan=false}={}){
 const guestKey=randomBytes(24).toString('hex'),hostKey=randomBytes(24).toString('hex');
 const addresses=Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address);
 const allowedHosts=new Set(['localhost','127.0.0.1',...addresses]);
 let host=null,latest=null,enabled=false,lastFrame=0;const guests=new Set();
 const send=(res,type,data)=>{if(!res.destroyed&&res.writableLength<500000)res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);};
 const broadcast=(type,data)=>{for(const res of guests)send(res,type,data);};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  const fail=(code,message)=>{res.writeHead(code,{'Content-Type':'text/plain'});res.end(message);};
  try{
   const url=new URL(req.url,'http://localhost');const hostname=(req.headers.host||'').split(':')[0];
   if(!allowedHosts.has(hostname))return fail(403,'Unrecognized host');
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return fail(403,'Different origin');
   const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1'].includes(hostname);
   const key=url.searchParams.get('key');
   const body=async()=>{let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>400000)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());};
   const json=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
   if(url.pathname==='/coop/session'&&req.method==='GET'){
    if(!local)return fail(403,'Open the host game on localhost');
    return json({lan,hostKey,joinPath:`/coop/#${guestKey}`,links:addresses.map(a=>`http://${a}:${server.address().port}/coop/#${guestKey}`)});
   }
   if(url.pathname==='/coop/host'&&req.method==='GET'){
    if(!local||key!==hostKey||!lan)return fail(403,'Host unavailable');
    if(host)return fail(409,'Another host tab is sharing');
    res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');host=res;enabled=true;
    res.on('close',()=>{if(host===res){host=null;enabled=false;latest=null;broadcast('offline',{});}});return;
   }
   if(url.pathname==='/coop/events'&&req.method==='GET'){
    if(!lan||key!==guestKey)return fail(403,'Invalid join link');
    if(guests.size>=2)return fail(409,'Room full');
    res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');guests.add(res);
    if(latest&&Date.now()-lastFrame<3000)send(res,'frame',latest);else send(res,'offline',{});
    res.on('close',()=>guests.delete(res));return;
   }
   if(url.pathname==='/coop/frame'&&req.method==='POST'){
    if(!local||key!==hostKey||!enabled)return fail(403,'Sharing is off');
    const frame=await body();if(!Number.isSafeInteger(frame.id)||typeof frame.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.image)||typeof frame.status!=='string'||frame.status.length>1000)return fail(400,'Invalid frame');
    latest={id:frame.id,image:frame.image,status:frame.status};lastFrame=Date.now();broadcast('frame',latest);return json({ok:true});
   }
   if(url.pathname==='/coop/command'&&req.method==='POST'){
    if(!lan||key!==guestKey)return fail(403,'Invalid join link');
    if(!enabled||!host||Date.now()-lastFrame>3000)return fail(503,'Host is not sharing a live game');
    const command=await body();if(!validCommand(command))return fail(400,'Invalid command');
    const now=Date.now();if(now-(server.lastCommand||0)<80)return fail(429,'Too fast');server.lastCommand=now;
    send(host,'command',command);return json({ok:true});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return fail(405,'Method not allowed');
   // Serve only the built game, never source, Git data, or sibling files.
   const decoded=decodeURIComponent(url.pathname);const path=resolve(root,'.'+decoded+(decoded.endsWith('/')?'index.html':''));
   const actual=await realpath(path);const base=await realpath(root);if(!actual.startsWith(base+sep)||!(await stat(actual)).isFile())return fail(404,'Not found');
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
   res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:await readFile(actual));
  }catch(error){if(!res.headersSent)fail(error.code==='ENOENT'?404:400,'File unavailable or invalid request');else res.end();}
 });
 const heartbeat=setInterval(()=>{host?.write(': ping\n\n');for(const guest of guests)guest.write(': ping\n\n');},10000);heartbeat.unref();server.on('close',()=>clearInterval(heartbeat));
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
 try{await stat(resolve(root,'index.html'));}catch{console.error('Build once while dependencies are installed: npm run build');process.exit(1);}
 const lan=process.argv.includes('--lan'),port=Number(process.env.PORT||5173);const server=createLocalServer(root,{lan});
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Stop the old server or set PORT=5174.`:e.message);process.exitCode=1;});
 server.listen(port,lan?'0.0.0.0':'127.0.0.1',()=>console.log(`Offline game: http://127.0.0.1:${port}/\n${lan?'LAN co-op enabled. Click HOST CO-OP in the game to get a join link.':'Solo mode. Use npm run play:lan for local co-op.'}\nNo internet connection is needed. Keep this terminal and the host game open.`));
}

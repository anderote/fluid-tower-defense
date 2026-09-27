import http from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalServer,validCommand} from './play.mjs';
test('only bounded co-op commands are accepted',()=>{
 assert.ok(validCommand({type:'place',kind:'crusher',x:.4,y:.5,frame:1}));
 for(const c of [{type:'reset'},{type:'place',kind:'evil',x:0,y:0,frame:1},{type:'place',kind:'crusher',x:Infinity,y:0,frame:1},{type:'place',kind:'crusher',x:0,y:2,frame:1}])assert.equal(validCommand(c),false);
});
test('offline server serves only the game and gates co-op behind live host and room keys',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fluid-local-'));await writeFile(join(root,'index.html'),'offline game');await mkdir(join(root,'coop'));await writeFile(join(root,'coop','index.html'),'partner');
 const server=createLocalServer(root,{lan:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;let host,guest;
 try{
  assert.equal(await (await fetch(url)).text(),'offline game');
  assert.equal((await fetch(url+'/../package.json')).status,404);
  assert.equal(await new Promise(resolve=>http.get(url+'/coop/session',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);})),403);
  const session=await(await fetch(url+'/coop/session')).json();assert.ok(session.lan);assert.ok(Array.isArray(session.links));
  const guestKey=session.joinPath.split('#')[1];
  assert.equal((await fetch(url+'/coop/host?key=wrong')).status,403);
  assert.equal((await fetch(url+'/coop/events?key=wrong')).status,403);
  const post=(path,data,extra={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
  assert.equal((await post('/coop/command?key='+guestKey,{type:'pause'})).status,503);
  assert.equal((await post('/coop/command?key='+guestKey,{type:'pause'},{Origin:'http://evil.test'})).status,403);
  host=await fetch(url+'/coop/host?key='+session.hostKey);const hostReader=host.body.getReader();await hostReader.read();
  guest=await fetch(url+'/coop/events?key='+guestKey);const guestReader=guest.body.getReader();await guestReader.read();
  assert.equal((await post('/coop/frame?key='+session.hostKey,{id:1,image:'data:image/jpeg;base64,YQ==',status:'Metal 3000'})).status,200);
  assert.match(new TextDecoder().decode((await guestReader.read()).value),/Metal 3000/);
  assert.equal((await post('/coop/command?key='+guestKey,{type:'reset'})).status,400);
  assert.equal((await post('/coop/command?key='+guestKey,{type:'pause'})).status,200);
  assert.match(new TextDecoder().decode((await hostReader.read()).value),/pause/);
  await hostReader.cancel();await guestReader.cancel();
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

test('solo launcher does not accept co-op connections',async()=>{
 const server=createLocalServer('/tmp',{lan:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{
  const session=await(await fetch(url+'/coop/session')).json();assert.equal(session.lan,false);
  assert.equal((await fetch(url+'/coop/host?key='+session.hostKey)).status,403);
  assert.equal((await fetch(url+'/coop/events?key='+session.joinPath.split('#')[1])).status,403);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

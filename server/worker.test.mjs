import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {MemoryBucket} from './memory-bucket.mjs';
import {validRemoteCommand} from '../scripts/coop-protocol.mjs';
test('public rooms isolate host controls, relay real UI state, acknowledge commands and revoke access',async()=>{
 const env={BUCKET:new MemoryBucket(),ASSETS:{fetch:()=>new Response('game')}};
 const request=(path,body,key)=>worker.fetch(new Request('https://game.test/api/coop/'+path,{method:body===undefined?'GET':'POST',headers:{...(key?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const room=await(await request('rooms',{})).json(),query='?room='+room.code;
 assert.match(room.code,/^[a-f0-9]{10}$/);
 assert.equal((await request('publish'+query,{},'wrong')).status,403);
 assert.equal((await request('commands'+query)).status,403);
 assert.equal((await request('command'+query,{type:'action',action:{type:'pause'}})).status,409);
 const frame={id:1,image:'data:image/jpeg;base64,YQ==',status:'Wave 1',ui:{metal:3000},infantry:{}};
 assert.equal((await request('publish'+query,frame,room.hostKey)).status,200);
 assert.equal((await(await request('frame'+query)).json()).ui.metal,3000);
 assert.equal((await request('command'+query,{type:'action',action:{type:'buy-command',id:'tesla'}})).status,200);
 const commands=await(await request('commands'+query,undefined,room.hostKey)).json();assert.equal(commands.commands.length,1);
 assert.equal((await request('ack'+query,{ids:commands.commands.map(c=>c.id)},room.hostKey)).status,200);
 assert.equal((await(await request('commands'+query,undefined,room.hostKey)).json()).commands.length,0);
 const other=await(await request('rooms',{})).json();assert.equal((await request('publish'+query,frame,other.hostKey)).status,403);
 assert.equal((await request('stop'+query,{},room.hostKey)).status,200);assert.equal((await request('frame'+query)).status,404);
 assert.equal((await worker.fetch(new Request('https://game.test/api/coop/rooms',{method:'POST',headers:{Origin:'https://evil.test'}}),env)).status,403);
});
test('remote input rejects selectors, arbitrary actions and unbounded coordinates',()=>{
 assert.ok(validRemoteCommand({type:'action',action:{type:'upgrade-tower',id:1,branch:0}}));
 for(const c of [{type:'action',action:{type:'eval',code:'evil'}},{type:'infantry',action:'build',kind:'"] script'},{type:'action',action:{type:'buy-command',id:'<script>'}},{type:'pointer',phase:'click',x:2,y:0,frame:1},{type:'pan',dx:Infinity,dy:0}])assert.equal(validRemoteCommand(c),false);
});

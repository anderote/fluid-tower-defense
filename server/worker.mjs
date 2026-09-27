import {validRemoteCommand,validFrame} from '../scripts/coop-protocol.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function body(request,limit){const reader=request.body?.getReader();if(!reader)throw Error('Missing body');let size=0,text='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Request too large');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/coop/'))return env.ASSETS.fetch(request);
 try{
  if(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Different origin'},403);
  const route=url.pathname.slice('/api/coop/'.length);
  if(route==='config')return json({cloud:true});
  if(route==='rooms'&&request.method==='POST'){
   const code=random(5),hostKey=random(24),expires=Date.now()+4*3600000;
   await env.BUCKET.put(`rooms/${code}/meta`,JSON.stringify({hostHash:await hash(hostKey),expires}));
   return json({code,hostKey,expires});
  }
  const code=url.searchParams.get('room');if(!/^[a-f0-9]{10}$/.test(code||''))return json({error:'Invalid room code'},400);
  const prefix=`rooms/${code}/`,object=await env.BUCKET.get(prefix+'meta');
  if(!object)return json({error:'Room closed or code incorrect'},404);
  const meta=await object.json();if(meta.expires<Date.now())return json({error:'Room expired; ask the host to create a new room'},410);
  const host=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  const needsHost=['publish','commands','ack','stop'].includes(route);
  if(needsHost&&(!host||await hash(host)!==meta.hostHash))return json({error:'Host key required'},403);
  if(route==='publish'&&request.method==='POST'){
   const frame=await body(request,1500000);if(!validFrame(frame))return json({error:'Invalid frame'},400);
   await env.BUCKET.put(prefix+'frame',JSON.stringify({...frame,receivedAt:Date.now()}));return json({ok:true});
  }
  if(route==='frame'&&request.method==='GET'){
   const frame=await env.BUCKET.get(prefix+'frame');if(!frame)return json({waiting:true});
   const data=await frame.json();if(Date.now()-data.receivedAt>12000)return json({waiting:true});
   return json(data);
  }
  if(route==='command'&&request.method==='POST'){
   const command=await body(request,4096);if(!validRemoteCommand(command))return json({error:'Invalid command'},400);
   const frame=await env.BUCKET.head(prefix+'frame');if(!frame||Date.now()-new Date(frame.uploaded).getTime()>12000)return json({error:'Host is not sharing a live game'},409);
   const queue=await env.BUCKET.list({prefix:prefix+'commands/',limit:65});if(queue.objects.length>=64)return json({error:'Connection is catching up. Try again shortly.'},429);
   const id=Date.now().toString().padStart(13,'0')+'-'+random(8);
   await env.BUCKET.put(prefix+'commands/'+id,JSON.stringify({id,command,time:Date.now()}));return json({ok:true});
  }
  if(route==='commands'&&request.method==='GET'){
   const list=await env.BUCKET.list({prefix:prefix+'commands/',limit:64});
   const items=await Promise.all(list.objects.map(async item=>(await env.BUCKET.get(item.key))?.json()));
   return json({commands:items.filter(Boolean)});
  }
  if(route==='ack'&&request.method==='POST'){
   const {ids}=await body(request,6000);if(!Array.isArray(ids)||ids.length>64||ids.some(id=>!/^\d{13}-[a-f0-9]{16}$/.test(id)))return json({error:'Invalid acknowledgement'},400);
   if(ids.length)await env.BUCKET.delete(ids.map(id=>prefix+'commands/'+id));return json({ok:true});
  }
  if(route==='stop'&&request.method==='POST'){
   await env.BUCKET.delete(prefix+'meta');const list=await env.BUCKET.list({prefix,limit:1000});if(list.objects.length)await env.BUCKET.delete(list.objects.map(o=>o.key));return json({ok:true});
  }
  return json({error:'Unknown operation'},404);
 }catch(error){console.error('Co-op request failed',error.message);return json({error:'Connection interrupted or invalid request. Please retry.'},400);}
}};

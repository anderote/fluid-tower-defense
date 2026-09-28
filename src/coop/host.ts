import type {Vec2,UIState} from '../contracts/index.ts';
import type {InfantryState,InfantryKind} from '../infantry/model.ts';
export type CoopSnapshot={ui:UIState;infantry:{state:InfantryState;selected:number|null;tool:'build'|'rally'|null;buildKind:InfantryKind;selectedSoldiers?:number[]}};
export type Command={type:string;[key:string]:any};
/** One authoritative simulation, with the production UI rendered independently on the partner. */
export function mountCoop(canvas:HTMLCanvasElement,callbacks:{screenToWorld:(x:number,y:number)=>Vec2;status:()=>string;snapshot:()=>CoopSnapshot;command:(command:Command,point?:Vec2)=>void}){
 let stream:EventSource|null=null,key='',room='',cloud=false,sharing=false,busy=false,last=0,id=0,generation=0;
 const frames=new Map<number,{time:number;start:Vec2;end:Vec2}>(),seen=new Set<string>();
 const panel=document.createElement('section');panel.className='coop-bar';panel.setAttribute('aria-label','Co-op controls');panel.hidden=true;
 const button=document.createElement('button');button.textContent='HOST CO-OP';
 const detail=document.createElement('span');panel.append(button,detail);canvas.closest('.pf')?.querySelector('#view-menu')?.append(panel);
 const capture=document.createElement('canvas'),context=capture.getContext('2d')!;
 let links:string[]=[],roomCode='';
 const url=(route:string)=>'/api/coop/'+route+'?room='+room;
 const headers=()=>({'Content-Type':'application/json',Authorization:'Bearer '+key});
 const unavailable=()=>{panel.hidden=false;button.disabled=true;detail.textContent='For co-op, open the public game or run npm run build && PORT=5175 npm run play:lan, then open localhost:5175.';};
 const stop=()=>{const wasSharing=sharing;sharing=false;generation++;stream?.close();stream=null;frames.clear();button.textContent='HOST CO-OP';detail.textContent='Sharing stopped.';if(cloud&&wasSharing)void fetch(url('stop'),{method:'POST',headers:headers(),keepalive:true}).catch(()=>{});};
 const receive=(command:Command)=>{
  if(['place','pointer','zoom'].includes(command.type)){
   const frame=frames.get(command.frame);if(!frame||performance.now()-frame.time>12000)return;
   callbacks.command(command,{x:frame.start.x+(frame.end.x-frame.start.x)*command.x,y:frame.start.y+(frame.end.y-frame.start.y)*command.y});
  }else callbacks.command(command);
 };
 const showLinks=()=>{
  button.textContent='STOP CO-OP';detail.replaceChildren(document.createTextNode('ROOM '+roomCode+' · Share one defense and the same controls. '));
  for(const address of links){const link=document.createElement('a');link.href=address;link.textContent=address.split('#')[0];link.target='_blank';link.rel='noreferrer';detail.append(link);
   const copy=document.createElement('button');copy.textContent='Copy link';copy.onclick=async()=>{try{await navigator.clipboard.writeText(address);copy.textContent='Copied!';}catch{const input=document.createElement('input');input.value=address;input.readOnly=true;input.setAttribute('aria-label','Join link to copy');detail.append(input);input.focus();input.select();copy.textContent='Press ⌘C';}};detail.append(copy);
  }
  if(!links.length)detail.textContent='No local network address found. Enable your hotspot, then restart the LAN launcher.';
 };
 void (async()=>{
  try{const config=await fetch('/api/coop/config');if(config.ok&&(await config.json()).cloud){cloud=true;panel.hidden=false;detail.textContent='Host online and send your partner the room link.';return;}}catch{}
  try{const response=await fetch('/coop/session');if(!response.ok){unavailable();return;}const session=await response.json();if(!session.lan){unavailable();return;}key=session.hostKey;links=session.links;roomCode=session.roomCode;panel.hidden=false;detail.textContent='Share this defense on your local network.';}catch{unavailable();}
 })();
 const poll=async(token:number)=>{
  if(!sharing||generation!==token)return;
  try{const response=await fetch(url('commands'),{headers:headers()});if(!response.ok)throw Error('Room unavailable');const data=await response.json();
   if(generation!==token)return;
   if(detail.textContent?.startsWith('Connection interrupted'))showLinks();
   for(const item of data.commands){if(!seen.has(item.id)&&Date.now()-item.time<12000){seen.add(item.id);receive(item.command);}}
   if(data.commands.length)await fetch(url('ack'),{method:'POST',headers:headers(),body:JSON.stringify({ids:data.commands.map((item:{id:string})=>item.id)})});
   if(seen.size>2048)seen.clear();
  }catch{if(sharing)detail.textContent='Connection interrupted. Reconnecting to your room…';}
  if(sharing&&generation===token)window.setTimeout(()=>void poll(token),150);
 };
 button.onclick=async()=>{
  if(sharing||stream){stop();return;}button.disabled=true;
  try{
   if(cloud){const response=await fetch('/api/coop/rooms',{method:'POST'});if(!response.ok)throw Error('Could not create room');const data=await response.json();room=data.code;key=data.hostKey;roomCode=room.toUpperCase().replace(/(.{5})(.{5})/,'$1-$2');links=[location.origin+'/coop/#'+room];sharing=true;showLinks();void poll(++generation);}
   else{stream=new EventSource('/coop/host?key='+key);stream.onopen=()=>{sharing=true;showLinks();};stream.onerror=()=>{stop();detail.textContent='Could not share. Check whether another host tab is sharing.';};stream.addEventListener('command',event=>receive(JSON.parse(event.data)));}
  }catch{detail.textContent='Could not create a room. Check your connection and try again.';}finally{button.disabled=false;}
 };
 window.addEventListener('pagehide',stop);
 return {frame(now:number){
  if(!sharing||busy||now-last<(cloud?300:150)||document.hidden)return;last=now;busy=true;
  const token=generation,bounds=canvas.getBoundingClientRect();capture.width=Math.min(1600,canvas.width);capture.height=Math.max(1,Math.round(capture.width*canvas.height/canvas.width));
  const frameId=++id;frames.set(frameId,{time:now,start:callbacks.screenToWorld(bounds.left,bounds.top),end:callbacks.screenToWorld(bounds.right,bounds.bottom)});
  for(const[old,frame]of frames)if(now-frame.time>12000)frames.delete(old);
  try{context.drawImage(canvas,0,0,capture.width,capture.height);
   const payload={id:frameId,image:capture.toDataURL('image/jpeg',.8),status:callbacks.status(),...callbacks.snapshot()};
   void fetch(cloud?url('publish'):'/coop/frame?key='+key,{method:'POST',headers:cloud?headers():{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(response=>{if(!response.ok&&generation===token){detail.textContent='Connection interrupted. Retrying…';}}).catch(()=>{}).finally(()=>{busy=false;});
  }catch{busy=false;stop();detail.textContent='Could not capture the battlefield. Solo play is still available.';}
 }};
}

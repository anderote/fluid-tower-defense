import {safeSnapshot} from './snapshot.ts';
import {createUI} from '../ui/index.ts';
import {createInfantryController} from '../infantry/controller.ts';
import {freshInfantry} from '../infantry/model.ts';
import {createRun} from '../game/index.ts';
import {damMap} from '../content/dam.ts';
import {mountRedAlertSoundtrack} from '../audio/red-alert-soundtrack.ts';
import type {CoopSnapshot,Command} from './host.ts';
import type {GameAction} from '../contracts/index.ts';
import './style.css';
export async function mountPartner(root:HTMLElement){
 let code=(new URLSearchParams(location.search).get('join')||location.hash.slice(1)).replace(/[\s-]/g,'').toLowerCase();
 let snapshot:CoopSnapshot|undefined,frameId=0,lastSeen=0,cloud=false,stream:EventSource|null=null,closed=false,queue=Promise.resolve(),online=false;
 const ui=createUI(root,action=>{if(action.type==='select-map'){status.textContent='The host chooses the battlefield before creating a room.';return;}send({type:'action',action});});
 const shell=root.querySelector<HTMLElement>('.pf')!;shell.classList.add('coop-guest','coop-offline');mountRedAlertSoundtrack(root);
 const bar=document.createElement('section');bar.className='coop-bar';bar.setAttribute('aria-label','Co-op controls');const status=document.createElement('span');status.id='connection';status.textContent='Connecting to shared defense…';bar.append(status);shell.querySelector('#view-menu')!.append(bar);
 const leave=document.createElement('button');leave.textContent='LEAVE CO-OP';leave.onclick=()=>{location.assign('/');};bar.append(leave);
 const form=document.createElement('form');form.className='coop-join';form.innerHTML='<label for="room-code">JOIN SHARED DEFENSE</label><input id="room-code" aria-label="Room code" placeholder="ABCDE-12345" maxlength="20" autocomplete="off" required><button>JOIN GAME</button><p role="status"></p>';root.append(form);
 const input=form.querySelector<HTMLInputElement>('input')!;input.value=code;
 form.onsubmit=e=>{e.preventDefault();const value=input.value.replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{10}$/.test(value)){form.querySelector('p')!.textContent='Enter the ten-character code shown by the host.';return;}location.hash=value;location.reload();};
 form.hidden=/^[a-f0-9]{10}$/.test(code);
 const map=damMap(),run=createRun(map);
 const infantry=createInfantryController(root,run,()=>map,()=>{},()=>{},()=>{},{send:(action,kind)=>send({type:'infantry',action,kind}),snapshot:()=>snapshot?.infantry});
 const context=ui.canvas.getContext('2d')!;
 const url=(route:string)=>'/api/coop/'+route+'?room='+code;
 function connection(value:boolean){online=value;shell.classList.toggle('coop-offline',!value);}
 function send(command:Command){if(!online)return;queue=queue.then(async()=>{if(!online)return;try{const response=await fetch(cloud?url('command'):'/coop/command?key='+code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});if(!response.ok){const text=await response.text();status.textContent='Command not applied: '+text;}}catch{connection(false);status.textContent='Connection lost. Reconnecting…';}});}
 const receive=async(frame:CoopSnapshot&{id:number;image:string})=>{
  if(!frame.ui||!frame.image)return;if(frame.id===frameId){lastSeen=Date.now();return;}
  const image=new Image();image.src=frame.image;await image.decode();if(closed)return;
  frame={...frame,ui:safeSnapshot(frame.ui),infantry:safeSnapshot(frame.infantry)};snapshot=frame;frameId=frame.id;lastSeen=Date.now();ui.canvas.width=image.naturalWidth;ui.canvas.height=image.naturalHeight;context.drawImage(image,0,0);
  ui.update(frame.ui);run.model.commandUpgrades=[...frame.ui.commandUpgrades];run.model.metal=frame.ui.metal;run.model.phase=frame.ui.phase;run.model.infantry=frame.infantry?.state??freshInfantry();infantry.update();connection(true);
  status.textContent='CONNECTED · ROOM '+code.toUpperCase().replace(/(.{5})(.{5})/,'$1-$2')+' · Shared tools, camera and Metal';form.hidden=true;
 };
 let loading=false;
 const poll=async()=>{if(closed||!form.hidden)return;try{const response=await fetch(url('frame'));const data=await response.json();if(!response.ok){if([400,404,410].includes(response.status)){form.hidden=false;form.querySelector('p')!.textContent=data.error||'Room unavailable';}throw Error(data.error||'Room unavailable');}if(data.waiting){connection(false);status.textContent='Waiting for the host. Keep the host game visible.';}else await receive(data);}catch(error){connection(false);status.textContent='Connection interrupted. Retrying… '+String(error);}if(!closed&&form.hidden)window.setTimeout(()=>void poll(),200);};
 if(form.hidden){
  try{const response=await fetch('/api/coop/config');cloud=response.ok&&!!(await response.json()).cloud;}catch{}
  if(cloud)void poll();else{stream=new EventSource('/coop/events?key='+code);stream.addEventListener('frame',event=>{if(loading)return;loading=true;void receive(JSON.parse(event.data)).catch(()=>{}).finally(()=>{loading=false;});});stream.addEventListener('offline',()=>{connection(false);status.textContent='Host stopped sharing.';});stream.onerror=()=>{connection(false);status.textContent='Host unavailable. Check the room code or ask your partner to start sharing.';};}
 }
 const interval=window.setInterval(()=>{if(lastSeen&&Date.now()-lastSeen>12000){connection(false);status.textContent='Host connection paused. Waiting for a live battlefield…';}},1000);
 const point=(event:MouseEvent)=>{const b=ui.canvas.getBoundingClientRect(),scale=Math.min(b.width/ui.canvas.width,b.height/ui.canvas.height),w=ui.canvas.width*scale,h=ui.canvas.height*scale;const x=(event.clientX-b.left-(b.width-w)/2)/w,y=(event.clientY-b.top-(b.height-h)/2)/h;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;};
 let moved=0;
 for(const phase of ['pointerdown','pointermove','pointerup','dblclick'])ui.canvas.addEventListener(phase,event=>{const e=event as PointerEvent;if(phase==='pointermove'&&performance.now()-moved<(cloud?400:100))return;if(phase==='pointermove')moved=performance.now();const p=point(e);if(!p)return;if(phase==='pointerdown'&&e.isTrusted)ui.canvas.setPointerCapture(e.pointerId);send({type:'pointer',phase,...p,button:e.button===2?2:0,buttons:e.buttons&2?2:e.buttons&1?1:0,shiftKey:e.shiftKey,frame:frameId});});
 ui.canvas.addEventListener('contextmenu',e=>e.preventDefault());
 ui.canvas.addEventListener('wheel',event=>{event.preventDefault();const p=point(event);if(p)send({type:'zoom',...p,frame:frameId,factor:event.deltaY<0?1.12:.89});},{passive:false});
 window.addEventListener('keydown',event=>{
  if((event.target as HTMLElement).closest('input,textarea,select')||event.metaKey||event.ctrlKey||!online)return;
  const key=event.key.toLowerCase(),towers=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator','crusher'];
  if(/^[1-9]$/.test(key)){event.preventDefault();send({type:'action',action:{type:'select-tower',kind:towers[Number(key)-1]}});return;}
  if(['escape',' '].includes(key)){event.preventDefault();send({type:'key',key:event.key});return;}
  const actions:Record<string,string>={q:'wall-tool',e:'wire-tool',r:'demolish-tool',u:'upgrade-tool',g:'slam-gates',f:snapshot?.ui.dam?'dam-flood':'fence-tool'};
  if(actions[key]){event.preventDefault();send({type:'action',action:{type:actions[key]}});}
  const directions:Record<string,[number,number]>={arrowleft:[-8,0],a:[-8,0],arrowright:[8,0],d:[8,0],arrowup:[0,-8],w:[0,-8],arrowdown:[0,8],s:[0,8]};if(directions[key]){event.preventDefault();const[dx,dy]=directions[key];send({type:'pan',dx,dy});}
 });
 window.addEventListener('pagehide',()=>{closed=true;stream?.close();clearInterval(interval);});
}

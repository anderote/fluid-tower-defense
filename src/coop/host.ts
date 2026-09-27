import type {Vec2,TowerKind} from '../contracts/index.ts';
type Command={type:string;kind?:TowerKind;x?:number;y?:number;frame?:number};
/** The guest receives pixels and sends bounded commands; the host owns all state. */
export function mountCoop(canvas:HTMLCanvasElement,callbacks:{screenToWorld:(x:number,y:number)=>Vec2;status:()=>string;command:(command:Command,point?:Vec2)=>void}){
 let stream:EventSource|null=null,key='',sharing=false,busy=false,last=0,id=0;
 const frames=new Map<number,{time:number;start:Vec2;end:Vec2}>();
 const panel=document.createElement('section');panel.style.cssText='padding:10px;background:#15252b;color:#deeff2;border-bottom:1px solid #4a737c;font:13px system-ui';panel.hidden=true;
 const button=document.createElement('button');button.textContent='HOST CO-OP';button.style.cssText='padding:8px;margin-right:10px';
 const detail=document.createElement('span');panel.append(button,detail);document.querySelector('.pf')?.prepend(panel);
 const capture=document.createElement('canvas'),context=capture.getContext('2d')!;
 let links:string[]=[];
 const stop=()=>{sharing=false;stream?.close();stream=null;frames.clear();button.textContent='HOST CO-OP';detail.textContent='Sharing stopped. Your partner cannot control the game.';};
 void fetch('/coop/session').then(async response=>{
  if(!response.ok)return;const session=await response.json();if(!session.lan)return;
  key=session.hostKey;links=session.links;panel.hidden=false;detail.textContent='Share this defense with someone on the same local network.';
 }).catch(()=>{});
 button.onclick=()=>{
  if(stream){stop();return;}
  stream=new EventSource('/coop/host?key='+key);
  stream.onopen=()=>{sharing=true;button.textContent='STOP CO-OP';detail.replaceChildren(document.createTextNode('Partner join link: '));for(const url of links){const link=document.createElement('a');link.href=url;link.textContent=url;link.style.cssText='color:#8ee8ee;display:block;overflow-wrap:anywhere';link.target='_blank';link.rel='noreferrer';detail.append(link);}if(!links.length)detail.textContent='No local network address found. Connect both Macs to a local network and restart the launcher.';};
  stream.onerror=()=>{stop();detail.textContent='Could not share. Another host tab may already be sharing. Try again.';};
  stream.addEventListener('command',event=>{
   const command=JSON.parse(event.data) as Command;
   if(command.type==='place'){
    const frame=frames.get(command.frame!);if(!frame||performance.now()-frame.time>3000)return;
    callbacks.command(command,{x:frame.start.x+(frame.end.x-frame.start.x)*command.x!,y:frame.start.y+(frame.end.y-frame.start.y)*command.y!});
   }else callbacks.command(command);
  });
 };
 window.addEventListener('pagehide',stop);
 return {frame(now:number){
  if(!sharing||busy||now-last<200||document.hidden)return;
  last=now;busy=true;
  const bounds=canvas.getBoundingClientRect();capture.width=Math.min(960,canvas.width);capture.height=Math.max(1,Math.round(capture.width*canvas.height/canvas.width));
  const frameId=++id;frames.set(frameId,{time:now,start:callbacks.screenToWorld(bounds.left,bounds.top),end:callbacks.screenToWorld(bounds.right,bounds.bottom)});
  for(const [old,frame] of frames)if(now-frame.time>3000)frames.delete(old);
  try{
   context.drawImage(canvas,0,0,capture.width,capture.height);
   const image=capture.toDataURL('image/jpeg',.65);
   void fetch('/coop/frame?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:frameId,image,status:callbacks.status()})}).then(response=>{if(!response.ok)stop();}).catch(stop).finally(()=>{busy=false;});
  }catch{busy=false;stop();detail.textContent='Could not capture the battlefield. Solo play is still available.';}
 }};
}

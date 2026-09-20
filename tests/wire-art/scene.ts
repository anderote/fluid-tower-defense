import {createRenderer} from '../../src/render/index.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';
import type {WireState,WireArtStyle} from '../../src/render/wire-art.ts';
const canvas=document.querySelector<HTMLCanvasElement>('canvas.scene')!,status=document.querySelector('#status')!;
const style:WireArtStyle=new URLSearchParams(location.search).get('wire')==='fenc'?'fenc':'barb';
document.querySelector('#style')!.textContent=`${style.toUpperCase()} · original sprites · matching floor pixel density · unchanged Soldat turrets`;
try{
  const atlas=await fetch('/assets/red-alert/atlas.json').then(r=>r.json()),image=new Image();image.src='/assets/red-alert/atlas.png';await image.decode();
  for(const name of ['barb','fenc']){
    const figure=document.createElement('figure'),sheet=document.createElement('canvas'),caption=document.createElement('figcaption');sheet.width=192;sheet.height=136;
    const ctx=sheet.getContext('2d')!;
    atlas.sprites[name].forEach((id:number,i:number)=>{const f=atlas.frames[id],floor=atlas.frames[atlas.sprites.floor[0]],x=(i%8)*24,y=Math.floor(i/8)*34;ctx.drawImage(image,floor.x,floor.y,24,24,x,y,24,24);ctx.drawImage(image,f.x,f.y,24,24,x,y,24,24);ctx.fillStyle='#c8c8af';ctx.font='8px monospace';ctx.fillText(String(i),x+1,y+32);});
    caption.textContent=name.toUpperCase();figure.append(sheet,caption);document.querySelector('#sheets')!.append(figure);
  }
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice(),context=canvas.getContext('webgpu')!,format=navigator.gpu.getPreferredCanvasFormat();
  let gpuError=false;device.addEventListener('uncapturederror',event=>{gpuError=true;status.textContent=event.error.message;});
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1};
  const renderer=await createRenderer(device,context,format,shared,canvas,{wireArt:style});
  const wires:WireState[]=[];
  const add=(x:number,y:number,health=100,breached=false)=>{const wire={x,y,width:4,height:4,health,maxHealth:100,breached};wires.push(wire);return wire;};
  for(let group=0;group<4;group++)for(let i=0;i<3;i++)add(8+group*16+i*4,8,[100,55,20,0][group],group===3);
  for(const [x,y] of [[8,24],[12,24],[16,24],[16,28],[16,32],[20,32],[24,32],[28,32],[24,28],[24,36],[32,32]])add(x,y);
  const middle=add(48,28);for(const x of [40,44,52,56])add(x,28);
  const architecture=[{x:0,y:0,width:80,height:4},{x:0,y:0,width:4,height:44},{x:76,y:0,width:4,height:44},{x:0,y:40,width:80,height:4},{x:4,y:16,width:28,height:4},{x:40,y:16,width:36,height:4}];
  const scene:RenderScene={count:0,time:0,heatmap:false,selection:null,effects:[],wires,map:{id:'wire-study',width:80,height:44,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:100},goalRadius:0},towers:[{id:1,kind:'autocannon',x:35,y:24,angle:-Math.PI/3,level:1,branch:0,cooldown:0,spent:0},{id:2,kind:'tesla',x:67,y:27,angle:0,level:1,branch:0,cooldown:0,spent:0}],placementGhost:{kind:'wire',x:36,y:32,width:4,height:4,valid:true}};
  const sync=()=>{scene.map.obstacles=[...architecture,...wires.filter(w=>!w.breached)];};sync();
  document.querySelector('#damage')!.addEventListener('click',()=>{for(const w of wires.filter(w=>w.y>=24&&!w.breached))w.health=w.health===100?20:100;});
  document.querySelector('#breach')!.addEventListener('click',()=>{middle.breached=!middle.breached;middle.health=middle.breached?0:100;sync();});
  document.querySelector('#ghost')!.addEventListener('click',()=>{scene.placementGhost!.valid=!scene.placementGhost!.valid;});
  let zoomed=true;document.querySelector('#zoom')!.addEventListener('click',()=>{zoomed=!zoomed;scene.map.width=zoomed?80:160;scene.map.height=zoomed?44:100;});
  let active=true;function draw(time=0){if(!active)return;scene.time=time/1000;const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);requestAnimationFrame(draw);}draw();
  await device.queue.onSubmittedWorkDone();if(!gpuError)status.textContent='Rendering · intact / worn / frayed / breached';
  window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=String(error);}

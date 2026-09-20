import {createInfantryAtlas} from '../../src/render/infantry-art.ts';
import {INFANTRY_FRAME,INFANTRY_FRAMES,INFANTRY_KINDS,INFANTRY_ATTACK,INFANTRY_DEATH,attackFrames} from '../../src/render/infantry-animation.ts';
import {createRenderer} from '../../src/render/index.ts';
import {ENEMIES} from '../../src/content/index.ts';
import {infantryStats,type Soldier} from '../../src/infantry/model.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';

const status=document.querySelector<HTMLElement>('#status')!,canvas=document.querySelector<HTMLCanvasElement>('#game')!,gallery=document.querySelector<HTMLCanvasElement>('#gallery')!;
try{
  const atlas=await createInfantryAtlas(),pixels=atlas.getContext('2d')!.getImageData(0,0,atlas.width,atlas.height).data;
  let checked=0;
  for(let row=0;row<32;row++)for(let frame=0;frame<INFANTRY_FRAMES;frame++){
    let visible=0;
    for(let y=0;y<48;y++)for(let x=0;x<48;x++){
      const alpha=pixels[((row*48+y)*atlas.width+frame*48+x)*4+3];
      if(alpha>128){visible++;if(x===0||y===0||x===47||y===47)throw Error(`Sprite touches tile edge: row ${row}, frame ${frame}`);}
    }
    if(visible<20)throw Error(`Empty sprite: row ${row}, frame ${frame}`);checked++;
  }
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();
  let failed=false;device.addEventListener('uncapturederror',event=>{failed=true;status.textContent=`FAIL: ${event.error.message}`;});
  const shared:SharedGPU={capacity:8,particles:device.createBuffer({size:8*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE})};
  const renderer=await createRenderer(device,canvas.getContext('webgpu')!,navigator.gpu.getPreferredCanvasFormat(),shared,canvas);
  const soldiers:Soldier[]=Array.from({length:8},(_,i)=>({id:i+1,home:1,kind:INFANTRY_KINDS[i%4],quality:0,health:infantryStats(INFANTRY_KINDS[i%4]).health,cooldown:0,flash:0,walk:0,dead:0,angle:i<4?0:Math.PI/2,x:8+i%4*14,y:7+Math.floor(i/4)*15}));
  const scene:RenderScene={map:{id:'infantry-study',width:60,height:31,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:59,y:15},goalRadius:0},count:8,time:0,towers:[],effects:[],heatmap:false,selection:null,infantry:{nextId:9,buildings:[],soldiers}};
  let pose='walk',paused=false,time=0,last=0,active=true,pending=0;const ctx=gallery.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  document.querySelector<HTMLSelectElement>('#pose')!.onchange=event=>{pose=(event.target as HTMLSelectElement).value;time=0;};
  document.querySelector<HTMLButtonElement>('#pause')!.onclick=event=>{paused=!paused;(event.target as HTMLButtonElement).textContent=paused?'Resume':'Pause';};
  document.querySelector<HTMLButtonElement>('#step')!.onclick=()=>{paused=true;document.querySelector('#pause')!.textContent='Resume';pending=.08;};
  function draw(now=0){
    if(!active)return;const dt=paused?pending:Math.min(.05,last?(now-last)/1000:0);pending=0;last=now;time+=dt;scene.time=time;
    const data=new Float32Array(8*16),enemy=ENEMIES.shambler;
    for(let i=0;i<8;i++){
      const s=soldiers[i],kind=s.kind!,baseX=7+i%4*14,baseY=7+Math.floor(i/4)*15,walk=pose==='walk',travel=(time*infantryStats(kind).speed)%4;
      s.x=baseX+(i<4&&walk?travel:0);s.y=baseY+(i>=4&&walk?travel:0);s.health=pose==='death'?0:infantryStats(kind).health;s.dead=pose==='death'?time%3:0;
      const cadence=infantryStats(kind).cooldown,age=time%cadence;
      s.cooldown=pose==='attack'?cadence-age:0;s.flash=pose==='attack'?Math.max(0,(kind==='flame'?.2:kind==='samurai'?.28:.1)-age):0;
      const zombieTravel=walk?(time*enemy.speed)%4:0,x=baseX+(i<4?zombieTravel:0),y=baseY+4+(i>=4?zombieTravel:0);
      data.set([x,y,walk&&i<4?enemy.speed:0,walk&&i>=4?enemy.speed:0,enemy.radius,enemy.mass,enemy.health,pose==='death'?-(time-time%3)*60:enemy.health,0,0,0,pose==='death'?-1:1,0,0,0,1],i*16);
    }
    device.queue.writeBuffer(shared.particles,0,data);const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);
    ctx.fillStyle='#263125';ctx.fillRect(0,0,gallery.width,gallery.height);
    INFANTRY_KINDS.forEach((kind,row)=>{
      const frame=pose==='idle'?0:pose==='walk'?1+Math.floor(time*10)%6:pose==='death'?INFANTRY_DEATH+Math.min(7,Math.floor((time%3)/.08)):INFANTRY_ATTACK+Math.floor(time*12)%attackFrames(kind);
      for(let facing=0;facing<8;facing++)ctx.drawImage(atlas,frame*INFANTRY_FRAME,(row*8+facing)*INFANTRY_FRAME,48,48,facing*150,row*120-15,144,144);
    });
    requestAnimationFrame(draw);
  }
  draw();await device.queue.onSubmittedWorkDone();if(!failed)status.textContent=`PASS: ${checked} populated, unclipped sprite frames · actual WebGPU renderer · no save data touched`;
  window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;throw error;}

import {connectGPU} from '../../src/runtime/gpu.ts';
import {createRenderer} from '../../src/render/index.ts';
import {createShamblerAtlas} from '../../src/render/shambler-art.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {buildNavigation} from '../../src/navigation/index.ts';
import {DEFAULT_TUNING,PARTICLE_FLOATS,type RenderScene,type Effect} from '../../src/contracts/index.ts';
import {checkAnimation} from './gpu-check.ts';

const status=document.querySelector('#status')!,stats=document.querySelector('#stats')!;
try{
  const canvas=document.querySelector<HTMLCanvasElement>('#game')!,gpu=await connectGPU(canvas),{device,shared}=gpu;
  const errors:string[]=[];device.addEventListener('uncapturederror',event=>{errors.push(event.error.message);status.textContent=`FAIL: ${errors.join('; ')}`;});
  device.pushErrorScope('validation');const checks=await checkAnimation(device);
  const renderer=await createRenderer(device,gpu.context,gpu.format,shared,canvas),physics=await createPhysics(device,shared);
  const atlas=createShamblerAtlas(),preview=document.querySelector<HTMLCanvasElement>('#atlas')!;preview.width=atlas.width;preview.height=atlas.height;preview.getContext('2d')!.drawImage(atlas,0,0);
  let mode='gallery',pose='walk',paused=false,time=0,tick=0,last=0,frames=0,statsTime=0,active=true,effects:Effect[]=[];
  let data=new Float32Array(8*PARTICLE_FLOATS);
  const scene:RenderScene={count:8,time:0,map:{id:'shambler-study',width:28,height:15,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:27,y:7},goalRadius:0},towers:[],effects:[],heatmap:false,selection:null};
  let navigation=buildNavigation(scene.map);
  function reset(){
    time=0;tick=0;effects=[];scene.count=mode==='crowd'?1600:mode==='stress'?65536:8;
    scene.map=mode==='gallery'?{...scene.map,width:28,height:15,obstacles:[],goal:{x:27,y:7}}:{...scene.map,width:160,height:100,obstacles:mode==='crowd'?[{x:60,y:0,width:5,height:40},{x:60,y:60,width:5,height:40}]:[],goal:{x:154,y:50}};
    data=new Float32Array(scene.count*16);
    for(let i=0;i<scene.count;i++){
      const angle=i*Math.PI/4,x=mode==='gallery'?4+i%4*6.5:mode==='crowd'?5+i%40*1.2:1+i%256*.61,y=mode==='gallery'?4+Math.floor(i/4)*7:mode==='crowd'?20+Math.floor(i/40)*1.2:1+Math.floor(i/256)*.38;
      data.set([x,y,mode==='gallery'?Math.cos(angle)*2:0,mode==='gallery'?Math.sin(angle)*2:0,.4125,1,30,30,0,0,0,1,0,0,0,1],i*16);
    }
    device.queue.writeBuffer(shared.particles,0,data);physics.reset();navigation=buildNavigation(scene.map);
  }
  document.querySelector('#scene')!.addEventListener('change',event=>{mode=(event.target as HTMLSelectElement).value;reset();});
  document.querySelector('#pose')!.addEventListener('change',event=>{pose=(event.target as HTMLSelectElement).value;reset();});
  document.querySelector('#reset')!.addEventListener('click',reset);
  document.querySelector('#pause')!.addEventListener('click',event=>{paused=!paused;(event.target as HTMLElement).textContent=paused?'Resume':'Pause';});
  document.querySelector('#step')!.addEventListener('click',()=>{paused=true;time+=.1;document.querySelector('#pause')!.textContent='Resume';});
  document.querySelector('#heat')!.addEventListener('click',()=>{scene.heatmap=!scene.heatmap;});
  document.querySelector('#blast')!.addEventListener('click',()=>{effects.push({kind:'blast',x:45,y:50,radius:20,strength:32,damage:0,direction:{x:0,y:0},cone:0,duration:0,source:0});});
  reset();
  function draw(now:number){
    if(!active)return;
    const dt=paused?0:Math.min(.033,Math.max(0,(now-last)/1000));last=now;time+=dt;scene.time=time;
    const encoder=device.createCommandEncoder();
    if(mode==='crowd'&&dt>0){physics.encode(encoder,{dt,tick:++tick,count:scene.count,map:scene.map,effects,tuning:DEFAULT_TUNING,navigation,lab:true});effects=[];}
    if(mode==='gallery'){
      for(let i=0;i<8;i++){
        const o=i*16,angle=i*Math.PI/4,forward={x:Math.cos(angle),y:Math.sin(angle)},walking=pose==='walk',hit=pose==='stagger'&&time>.35;
        const travel=walking?(time%1.1)*2:hit?-Math.min(.8,(time-.35)*3):0;
        data[o]=4+i%4*6.5+forward.x*travel;data[o+1]=4+Math.floor(i/4)*7+forward.y*travel;
        data[o+2]=forward.x*(hit?-10:walking?2:time<.05?2:0);data[o+3]=forward.y*(hit?-10:walking?2:time<.05?2:0);
        const dead=pose==='death'&&time>.4;data[o+11]=dead?-1:1;data[o+7]=dead?-24:30;
      }
      device.queue.writeBuffer(shared.particles,0,data);
    }
    renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);frames++;
    if(now-statsTime>1000){stats.textContent=`${scene.count.toLocaleString()} zombies · ${(frames*1000/(now-statsTime)).toFixed(0)} displayed fps · ${gpu.adapter} · GPU errors ${errors.length}`;frames=0;statsTime=now;}
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
  status.textContent=`PASS: ${checks} animation checks, including unchanged physics data, pause, knockback, death and slot reuse.`;
  window.addEventListener('pagehide',()=>{active=false;renderer.destroy();physics.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;}

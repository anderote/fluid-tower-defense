import {connectGPU} from '../../src/runtime/gpu.ts';
import {GPUProfiler,summarize} from '../../src/runtime/profiler.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {createRenderer} from '../../src/render/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {createHorde} from '../../src/sim/horde/index.ts';
import {DEFAULT_TUNING,P,PARTICLE_FLOATS,type WorldMap,type Tower} from '../../src/contracts/index.ts';
import {compileTower} from '../../src/content/index.ts';
import {buildNavigation} from '../../src/navigation/index.ts';
import {CORPSE_CAPACITY,HIT_CAPACITY} from '../../src/effects/aftermath.ts';
const baseParams=new URLSearchParams(location.search),output=document.querySelector('#results')!,status=document.querySelector('#status')!,button=document.querySelector<HTMLButtonElement>('#run')!;
const nextFrame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
const scenarios=['open','dense','jam','obstacles','combat','aftermath'];
const reports:unknown[]=[];
button.onclick=async()=>{
 button.disabled=true;reports.length=0;output.textContent='';
 try{
  const requested=baseParams.get('scenario'),selected=requested?scenarios.filter(s=>s===requested):scenarios;
  if(!selected.length)throw Error('Unknown scenario');
  const compare=baseParams.get('compare');
  if(compare&&!['targets','dispatch','obstacles','blood','solver','scale'].includes(compare))throw Error('Unknown comparison');
  const variants=compare?(compare==='solver'?['exact','hybrid','hybrid','exact']:compare==='scale'?['1','.5','.5','1']:['reference','optimized','optimized','reference']):['default'];
  for(const scenario of selected)for(const [trial,variant] of variants.entries()){
   const params=new URLSearchParams(baseParams);if(compare)params.set(compare,variant);
   status.textContent=`Running ${scenario}, trial ${trial+1}/${variants.length} (${variant})…`;
   const count=Math.min(50000,Math.max(64,Number(params.get('population'))||6000)),frames=Math.min(3600,Math.max(12,Number(params.get('frames'))||36)),warmup=8,continuous=params.has('continuous');
   const gpu=await connectGPU(document.querySelector('canvas')!,{profile:params.get('timestamps')!=='off'}),errors:string[]=[];
   try{
   gpu.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
   const profile=new GPUProfiler(gpu.device),physics=await createPhysics(gpu.device,gpu.shared,{indexedObstacles:params.get('obstacles')!=='reference',crowdMode:params.get('solver')==='hybrid'?'hybrid':'exact'}),combat=await createCombat(gpu.device,gpu.shared,{spatialTargets:params.get('targets')!=='reference',parallelTowers:params.get('dispatch')!=='reference'});
   gpu.shared.shotState=combat.shotState;
   const renderer=await createRenderer(gpu.device,gpu.context,gpu.format,gpu.shared,document.querySelector('canvas')!,{resolutionScale:Number(params.get('scale'))||1,compactBlood:params.get('blood')==='optimized'});
   const obstacles=scenario==='obstacles'?Array.from({length:400},(_,i)=>({x:110+(i%20)*2,y:2+Math.floor(i/20)*4,width:1,height:3})):scenario==='open'?[]:[{x:102,y:0,width:3,height:44},{x:102,y:56,width:3,height:44}];
   const map:WorldMap={id:`benchmark-${scenario}`,width:160,height:100,spawn:{x:0,y:0,width:90,height:100},goal:{x:158,y:50},goalRadius:3,obstacles};
   const spacing=scenario==='open'?1.05:scenario==='jam'?.22:.65,columns=Math.ceil(Math.sqrt(count*1.6));
   map.width=Math.max(map.width,columns*spacing+4);map.height=Math.max(map.height,Math.ceil(count/columns)*spacing+4);map.goal={x:map.width-2,y:map.height/2};
   const points=Array.from({length:count},(_,i)=>({x:2+(i%columns)*spacing,y:2+Math.floor(i/columns)*spacing}));
   const initial=encodeHorde([{kind:'shambler',count,seed:147}],points);
   const horde=continuous?await createHorde(gpu.device,gpu.shared):undefined;
   const towers:Tower[]=scenario==='combat'||scenario==='aftermath'?Array.from({length:24},(_,i)=>({id:i+1,kind:(['autocannon','mortar','tesla','incinerator'] as const)[i%4],x:35+(i%6)*10,y:20+Math.floor(i/6)*14,level:Math.min(50,Math.max(0,Number(params.get('level'))||0)),veterancy:Math.min(100,Math.max(0,Number(params.get('veterancy'))||0)),branch:-1,angle:0,cooldown:0,spent:0})):[];
   const navigation=buildNavigation(map),timings:number[]=[],cpu:number[]=[],wall:number[]=[],reads:Promise<void>[]=[];
   let previous=0,begin=0,end=0,tick=0;
   const mode=params.get('only')??'all';
   for(let sample=-warmup;sample<frames;sample++){
    const now=await nextFrame();if(sample===0){await Promise.all(reads);profile.reset();begin=performance.now();previous=now;}
    if(sample>0)timings.push(now-previous);previous=now;
    const started=performance.now();
    // Restore the same population every frame: a sustained workload, not a shrinking crowd.
    if(!continuous||sample===-warmup)gpu.device.queue.writeBuffer(gpu.shared.particles,0,initial);
    if(scenario==='aftermath'){
     const records=new Float32Array((CORPSE_CAPACITY+HIT_CAPACITY)*12);
     const age=params.has('settled')&&sample>=0?50:0;
     for(let i=0;i<CORPSE_CAPACITY+HIT_CAPACITY;i++)records.set([12+(i%64)*1.2,8+Math.floor(i/64)*1.5,.4125,0,1,0,0,i%3,(tick+1)/60-(i%60)/60-age,i+1,25,1],i*12);
     gpu.device.queue.writeBuffer(gpu.shared.aftermath!,32,records);
    }
    const measured=profile.wrap(gpu.device.createCommandEncoder({label:`Benchmark ${scenario}`})),encoder=measured.encoder;
    if(continuous&&sample!==-warmup)horde!.encode(encoder,initial,count);
    const frame={dt:1/60,tick:++tick,count,map,effects:[],tuning:DEFAULT_TUNING,navigation,lab:true,towers:towers.map(tower=>({tower,definition:compileTower(tower,[])}))};
    if(mode!=='render'){
     if(mode!=='physics')combat.encodeBefore(encoder,frame);
     if(mode!=='combat')physics.encode(encoder,frame);
     if(mode!=='physics')combat.encodeAfter(encoder,frame);
    }
    if(mode==='all'||mode==='render')renderer.encode(encoder,{count,time:tick/60,map,towers,effects:[],heatmap:true,selection:null,aftermathVisible:scenario==='aftermath'});
    measured.resolve();gpu.device.queue.submit([encoder.finish()]);
    if(sample>=0)cpu.push(performance.now()-started);
    reads.push(measured.read());
    // Deliberately bound queue depth; this measures completed work, not enqueue speed.
    await gpu.device.queue.onSubmittedWorkDone();
    if(sample>=0)wall.push(performance.now()-started);
    if(errors.length)throw Error(errors.join('\n'));
   }
   end=performance.now();await Promise.all(reads);
   const staging=gpu.device.createBuffer({size:count*PARTICLE_FLOATS*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=gpu.device.createCommandEncoder();e.copyBufferToBuffer(gpu.shared.particles,0,staging,0,staging.size);gpu.device.queue.submit([e.finish()]);await staging.mapAsync(GPUMapMode.READ);
   const particles=new Float32Array(staging.getMappedRange());let live=0,invalid=0,arrivals=count;for(let i=0;i<count;i++){if(particles[i*PARTICLE_FLOATS+P.alive]>.5)live++;arrivals+=particles[i*PARTICLE_FLOATS+P.generation];for(let j=0;j<PARTICLE_FLOATS;j++)if(!Number.isFinite(particles[i*PARTICLE_FLOATS+j]))invalid++;}staging.unmap();staging.destroy();
   const counterRead=gpu.device.createBuffer({size:64,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),counterEncoder=gpu.device.createCommandEncoder();counterEncoder.copyBufferToBuffer(gpu.shared.counters,0,counterRead,0,64);gpu.device.queue.submit([counterEncoder.finish()]);await counterRead.mapAsync(GPUMapMode.READ);const counters=Array.from(new Uint32Array(counterRead.getMappedRange()));counterRead.unmap();counterRead.destroy();
   if(continuous&&mode==='all'&&live+counters[0]!==arrivals)throw Error(`Population conservation failed: ${live} live + ${counters[0]} deaths != ${arrivals} arrivals`);
   if(invalid||counters[5]||profile.errors.length)throw Error('Invalid particles or profiler errors');
   const report={scenario,mode,trial,variant,options:Object.fromEntries(params),adapter:gpu.adapter,population:count,liveAtLastRead:live,invalid,frames,continuousAccounting:continuous?{arrivals,kills:counters[0],crushKills:counters[1],earned:counters[3],invalidCounter:counters[5],conserved:live+counters[0]===arrivals}:undefined,canvas:[document.querySelector('canvas')!.width,document.querySelector('canvas')!.height],fixture:continuous?'evolving survivors; dead slots replenished on GPU from fixed distributed arrivals; no natural wave pacing; one 1/60 step/frame; bounded queue':'population restored per frame; one 1/60 step per frame; bounded queue; aftermath ring saturated',simulationSecondsPerWallSecond:mode==='render'?0:(frames/60)/((end-begin)/1000),frame:summarize(timings),cpuEncode:summarize(cpu),submitToCompletionIncludingEncode:summarize(wall),gpu:profile.report(),errors};
   reports.push(report);output.textContent=JSON.stringify(reports,null,2);
   profile.destroy();renderer.destroy();physics.destroy();combat.destroy();horde?.destroy();
   }finally{gpu.device.destroy();}
  }
  status.textContent='Complete';
 }catch(e){status.textContent='FAILED';output.textContent+='\n'+String(e);}finally{button.disabled=false;}
};
if(baseParams.has('autorun'))button.click();

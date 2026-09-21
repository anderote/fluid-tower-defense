import {connectGPU} from '../../src/runtime/gpu.ts';
import {createPhysics} from '../../src/sim/physics/index.ts';
import {runGPUValidation} from '../../src/validation/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {compileTower} from '../../src/content/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,type SharedGPU,type WorldMap,type Tower,type TowerKind} from '../../src/contracts/index.ts';
const output=document.querySelector('#results')!,status=document.querySelector('#status')!;
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
const gpu=await connectGPU(document.querySelector('canvas')!),errors:string[]=[];
gpu.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
async function read(buffer:GPUBuffer){
 const staging=gpu.device.createBuffer({size:buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=gpu.device.createCommandEncoder();
 encoder.copyBufferToBuffer(buffer,0,staging,0,buffer.size);gpu.device.queue.submit([encoder.finish()]);await staging.mapAsync(GPUMapMode.READ);const copy=staging.getMappedRange().slice(0);staging.unmap();staging.destroy();return copy;
}
try{
 const points=[{x:9.6,y:10},{x:10.05,y:20},{x:20,y:49.5},{x:25,y:50.1},{x:-7,y:4},{x:13,y:47},{x:50,y:70},{x:40,y:99}];
 const initial=encodeHorde([{kind:'brute',count:points.length,seed:1}],points);initial[P.vx]=25;
 const make=():SharedGPU=>({capacity:points.length,particles:gpu.device.createBuffer({size:initial.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:gpu.device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})});
 const left=make(),right=make(),indexed=await createPhysics(gpu.device,left),reference=await createPhysics(gpu.device,right,{indexedObstacles:false});
 for(const s of [left,right])gpu.device.queue.writeBuffer(s.particles,0,initial);
 const map:WorldMap={id:'parity',width:160,height:100,spawn:{x:0,y:0,width:5,height:100},goal:{x:150,y:50},goalRadius:2,obstacles:[{x:10,y:0,width:.1,height:40},{x:0,y:50,width:60,height:.2},{x:-8,y:3,width:3,height:3},{x:13,y:48,width:8,height:8}]};
 let maxDifference=0;
 for(let tick=1;tick<=24;tick++){
  if(tick===12)map.obstacles=[...map.obstacles.slice(1),{x:40,y:80,width:2,height:20}];
  const frame={dt:1/60,tick,count:points.length,map,effects:[],tuning:DEFAULT_TUNING,lab:false};
  for(const physics of [indexed,reference]){const encoder=gpu.device.createCommandEncoder();physics.encode(encoder,frame);gpu.device.queue.submit([encoder.finish()]);}
  const a=new Float32Array(await read(left.particles)),b=new Float32Array(await read(right.particles));
  for(let i=0;i<a.length;i++){assert(Number.isFinite(a[i]),'non-finite indexed state');maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));}
  assert(maxDifference<.0001,`indexed/reference particle difference ${maxDifference}`);
  const c=new Uint32Array(await read(left.obstacleCounters!)),d=new Uint32Array(await read(right.obstacleCounters!));
  assert(c.length===d.length&&c.every((v,i)=>v===d[i]),'obstacle telemetry differs');
 }
 output.textContent+=`PASS indexed/reference parity, thin walls, embedded recovery, offscreen obstacles, dynamic edits; max difference ${maxDifference}\n`;
 indexed.destroy();reference.destroy();for(const s of [left,right]){s.particles.destroy();s.counters.destroy();}
 // Compare full-scan and indexed target acquisition through firing, Tesla chains,
 // burn, heavy impacts, generation recycling, focus changes and empty populations.
 const combatInitial=encodeHorde([{kind:'shambler',count:256,seed:2}],Array.from({length:256},(_,i)=>({x:5+(i%16)*2,y:5+Math.floor(i/16)*2})));
 const makeCombat=():SharedGPU=>({capacity:256,particles:gpu.device.createBuffer({size:combatInitial.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:gpu.device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})});
 const cs=[makeCombat(),makeCombat()],cm=[await createCombat(gpu.device,cs[0]),await createCombat(gpu.device,cs[1],{spatialTargets:false})];
 const kinds:TowerKind[]=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator'];
 const towers:Tower[]=kinds.map((kind,i)=>({id:i+1,kind,x:10+i*2,y:18,level:0,branch:i%2,angle:0,cooldown:0,spent:0}));
 for(const s of cs)gpu.device.queue.writeBuffer(s.particles,0,combatInitial);
 for(let tick=1;tick<=90;tick++){
  if(tick===25)towers[4].groundTarget={x:20,y:20};
  if(tick===40){for(let i=0;i<256;i++)combatInitial[i*16+P.generation]=2;for(const s of cs)gpu.device.queue.writeBuffer(s.particles,0,combatInitial);}
  const frame={dt:1/60,tick,count:tick>=80?0:256,map:{...map,obstacles:[{x:28,y:8,width:1,height:30}]},effects:[],tuning:DEFAULT_TUNING,lab:true,towers:towers.map(tower=>({tower,definition:compileTower(tower,[])}))};
  for(const combat of cm){const e=gpu.device.createCommandEncoder();combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);gpu.device.queue.submit([e.finish()]);}
  if(tick%10===0){
   for(const [a,b,name] of [[cs[0].particles,cs[1].particles,'particles'],[cs[0].counters,cs[1].counters,'counters'],[cm[0].shotState,cm[1].shotState,'shots'],[cs[0].teslaState!,cs[1].teslaState!,'Tesla']] as const){
    const av=new Uint32Array(await read(a)),bv=new Uint32Array(await read(b));assert(av.every((v,i)=>v===bv[i]),`target reference ${name} mismatch at tick ${tick}`);
   }
  }
 }
 for(const c of cm)c.destroy();for(const s of cs){s.particles.destroy();s.counters.destroy();}
 output.textContent+='PASS indexed/full-scan combat parity for all eight weapons, focus, recycling and zero population\n';
 const checks=await runGPUValidation(gpu.device);for(const check of checks){output.textContent+=`${check.passed?'PASS':'FAIL'} ${check.name}: ${check.details}\n`;assert(check.passed,check.details);}
 await gpu.device.queue.onSubmittedWorkDone();assert(!errors.length,errors.join('\n'));status.textContent=`Complete: ${checks.length+2} checks passed, zero GPU errors`;
}catch(e){status.textContent='FAILED';output.textContent+='\n'+String(e)+'\n'+errors.join('\n');}finally{gpu.device.destroy();}

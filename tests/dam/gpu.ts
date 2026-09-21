import {createPhysics} from '../../src/sim/physics/index.ts';
import {buildNavigation,mapWithTurretObstacles} from '../../src/navigation/index.ts';
import {advanceDam,releaseFlood} from '../../src/game/dam.ts';
import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {DEFAULT_TUNING,P,COUNTER_WORDS} from '../../src/contracts/index.ts';
import {damMap} from '../../src/content/dam.ts';
const status=document.querySelector('#status')!;
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
try{
 const {device,shared}=await connectGPU(document.querySelector('canvas')!);device.pushErrorScope('validation');
 const combat=await createCombat(device,shared);
 const frame:CombatFrame={dt:1/60,tick:60,count:4,map:damMap(),effects:[{x:50,y:50,kind:'flood',radius:10,cone:8,damage:10,strength:12,direction:{x:-1,y:0},duration:1/60,source:0}],tuning:DEFAULT_TUNING,lab:true,towers:[]};
 const seed=(hp:number)=>{const data=new Float32Array(64);[[50,50],[60,58],[60.1,50],[50,58.1]].forEach(([x,y],i)=>data.set([x,y,0,0,.4125,1,hp,hp,0,0,0,1,0,0,0,1],i*16));device.queue.writeBuffer(shared.particles,0,data);device.queue.writeBuffer(shared.counters,0,new Uint32Array(COUNTER_WORDS));};
 const step=()=>{const e=device.createCommandEncoder();combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);};
 const read=async(buffer:GPUBuffer,size:number)=>{const b=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyBufferToBuffer(buffer,0,b,0,size);device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const a=new Float32Array(b.getMappedRange()).slice();b.unmap();b.destroy();return a;};
 seed(100);step();let p=await read(shared.particles,256);
 assert(p[P.hp]===90&&p[16+P.hp]===90,'Flood rectangle omitted inside targets');
 assert(p[32+P.hp]===100&&p[48+P.hp]===100,'Flood damaged targets outside channel/front');
 assert(p[P.vx]===-12&&p[16+P.vx]===-12&&p[32+P.vx]===0,'Flood did not push upstream');
 assert(p[P.slow]>.49,'Flood did not slow survivors');
 combat.reset();seed(8);step();p=await read(shared.particles,256);const counters=new Uint32Array((await read(shared.counters,COUNTER_WORDS*4)).buffer);
 assert(p[P.alive]===-1&&p[16+P.alive]===-1&&counters[0]===2,'Flood kills missing from settlement');
 assert(counters.slice(16,80).every(v=>v===0),'Flood assigned kills to an unrelated tower');
 assert(counters[15]>0,'Flood kills did not award bounty credit');
 combat.reset();const map=damMap();releaseFlood(map);frame.effects=advanceDam(map,1/60,true);frame.count=3;
 const targets=new Float32Array(48);[24,50,76].forEach((y,i)=>targets.set([131.5,y,0,0,.4125,1,100,100,0,0,0,1,0,0,0,1],i*16));device.queue.writeBuffer(shared.particles,0,targets);step();p=await read(shared.particles,192);
 assert(p[P.hp]<100&&p[32+P.hp]<100,'Actual reservoir release missed a side spillway');
 assert(p[16+P.hp]<100&&p[16+P.vx]<0&&p[16+P.slow]>0,'Actual reservoir release missed the central spillway');
 // Exercise production navigation and body collision through a deployed gate.
 const physics=await createPhysics(device,shared);
 const passageMap=mapWithTurretObstacles(damMap(),[{kind:'crusher',x:44,y:50}]);
 const navigation=buildNavigation(passageMap);
 const walkers=new Float32Array(48);[48,50,52].forEach((y,i)=>walkers.set([37,y,0,0,.4125,1,100,100,0,0,0,1,0,0,0,1],i*16));
 device.queue.writeBuffer(shared.particles,0,walkers);
 for(let tick=1;tick<=360;tick++){
  const e=device.createCommandEncoder();physics.encode(e,{dt:1/60,tick,count:3,map:passageMap,navigation,effects:[],tuning:DEFAULT_TUNING,lab:false});device.queue.submit([e.finish()]);
 }
 p=await read(shared.particles,192);
 for(let i=0;i<3;i++)assert(p[i*16+P.x]>49&&p[i*16+P.y]>45&&p[i*16+P.y]<55,'Zombie failed to cross the crusher mouth');
 physics.destroy();
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent='PASS: 12 GPU checks — rectangular damage, boundaries, upstream impulse, slow, kills, attribution, salvage, all three spillways and three zombies walking through a crusher.';combat.destroy();device.destroy();
}catch(error){status.textContent='FAIL: '+String(error);console.error(error);}

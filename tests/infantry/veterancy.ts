import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {createInfantryGPU} from '../../src/infantry/gpu.ts';
import {awardInfantryKillTotals,freshInfantry,type Soldier} from '../../src/infantry/model.ts';
import {launchInfantryProjectile} from '../../src/infantry/projectiles.ts';
import {DEFAULT_TUNING,INFANTRY_KILL_COUNTER_OFFSET,type WorldMap} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!;
try{
 const {device,shared}=await connectGPU(document.querySelector('canvas')!);device.pushErrorScope('validation');
 const combat=await createCombat(device,shared),infantry=await createInfantryGPU(device,shared),state=freshInfantry();
 const archer:Soldier={id:2,home:1,kind:'archer',x:5,y:20,health:32,quality:0,angle:0,cooldown:0,flash:0,walk:0,dead:0};state.soldiers=[archer];
 const map:WorldMap={id:'xp-gpu',width:60,height:40,spawn:{x:0,y:0,width:1,height:1},goal:{x:58,y:20},goalRadius:1,obstacles:[]};
 let previous:number[]=[];
 for(let kill=1;kill<=2;kill++){
  const shot={soldier:2,target:0,generation:kill,damage:10,x:20,y:20},arrow=launchInfantryProjectile(archer,shot,100)!;
  device.queue.writeBuffer(shared.particles,0,new Float32Array([arrow.target.x,arrow.target.y,0,0,.5,1,9,9,0,0,0,1,0,0,0,kill]));
  const frame:CombatFrame={dt:1/60,tick:100+kill,count:1,map,effects:[],tuning:DEFAULT_TUNING,lab:true,towers:[]};
  const e=device.createCommandEncoder();infantry.encode(e,[archer],[],map,1,false,[],1/60,map,[arrow]);combat.encodeBefore(e,frame);combat.encodeAfter(e,frame);device.queue.submit([e.finish()]);
  // A later frame may change the live roster before the asynchronous settlement arrives.
  infantry.reset();
  const read=device.createBuffer({size:8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),copy=device.createCommandEncoder();copy.copyBufferToBuffer(shared.counters,INFANTRY_KILL_COUNTER_OFFSET*4,read,0,8);device.queue.submit([copy.finish()]);await read.mapAsync(GPUMapMode.READ);const totals=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();read.destroy();
  awardInfantryKillTotals(state,totals,previous);previous=totals;
  if(archer.kills!==kill||archer.veterancyXp!==kill)throw Error(`Kill ${kill} failed to reach infantry XP: ${JSON.stringify({totals,kills:archer.kills,xp:archer.veterancyXp})}`);
 }
 if(archer.veterancy!==1)throw Error(`Expected archer rank 1 at 2 kills, got ${archer.veterancy}`);
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent='PASS: Actual GPU arrow kills → settlement counters → individual XP → rank 1 after 2 kills, despite live-roster reset.';
 infantry.destroy();combat.destroy();device.destroy();
}catch(error){status.textContent='FAIL: '+String(error);console.error(error);}

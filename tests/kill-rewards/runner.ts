import {DEFAULT_MAP,compileTower} from '../../src/content/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,PARTICLE_FLOATS,type SharedGPU} from '../../src/contracts/index.ts';
import {createRun} from '../../src/game/index.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
const status=document.querySelector('#status')!;
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:9}});device.pushErrorScope('validation');
 const count=4096,shared:SharedGPU={capacity:count,particles:device.createBuffer({size:count*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})};
 const combat=await createCombat(device,shared),run=createRun();
 const placed=run.place('repulsor',{x:84,y:50});if(!placed.ok||!placed.tower)throw Error('Fixture placement failed');
 const tower=placed.tower,definition={...compileTower(tower),damage:1000,force:0};
 run.model.commandUpgrades.push('salvage-magnets');const initialMetal=run.model.metal;
 const data=new Float32Array(count*PARTICLE_FLOATS);
 for(let i=0;i<count;i++){data.set([89,50,0,0,.4125,1,30,30,0,0,0,1,0,0,0,1],i*PARTICLE_FLOATS);}
 device.queue.writeBuffer(shared.particles,0,data);
 // Fire once, then continue settlement to prove dead slots cannot pay again.
 for(let tick=1;tick<=60;tick++){const encoder=device.createCommandEncoder(),frame={dt:1/60,tick,count,map:DEFAULT_MAP,tuning:DEFAULT_TUNING,lab:true,effects:[],towers:[{tower,definition}]};combat.encodeBefore(encoder,frame);combat.encodeAfter(encoder,frame);device.queue.submit([encoder.finish()]);}
 const staging=device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(shared.counters,0,staging,0,staging.size);device.queue.submit([encoder.finish()]);await staging.mapAsync(GPUMapMode.READ);const counters=new Uint32Array(staging.getMappedRange()).slice();staging.unmap();
 assert(counters[0]===4096,`Burst lost kills: ${counters[0]} / ${count}; live ${counters[4]}; attributed ${counters[16]}`);assert(counters[16]===4096,'Burst lost turret attribution');assert(counters[3]===1228&&counters[15]===12288,'Incorrect base payout or lost bounty remainder');
 const report={epoch:run.epoch,tick:60,kills:counters[0],crushKills:counters[1],leaks:0,earned:counters[3],live:0,invalid:0,maxPacking:0,towerKills:Array.from(counters.slice(16,80))};
 run.applySettlement(report);run.applySettlement(report);run.applySettlement({...report,tick:61});
 assert(run.model.metal-initialMetal===1535,'Salvage payout is incorrect');assert(tower.veterancyXp===4096&&tower.kills===4096,'XP missing or awarded twice');
 const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent='PASS: 4,096 simultaneous kills → 1,228 base Metal + 307 salvage bonus; 4,096 turret XP. No duplicate rewards over 60 simulation ticks or repeated readbacks.';
 staging.destroy();combat.destroy();device.destroy();
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}

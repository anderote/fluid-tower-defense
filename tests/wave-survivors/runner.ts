import {createHorde} from '../../src/sim/horde/index.ts';
import {encodeHorde} from '../../src/sim/horde/model.ts';
import {createRun,waveFor} from '../../src/game/index.ts';
import {P,PARTICLE_BYTES,PARTICLE_FLOATS,COUNTER_WORDS,type SharedGPU} from '../../src/contracts/index.ts';
const status=document.querySelector('#status')!;
try{
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();
 const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const shared:SharedGPU={capacity:4,particles:device.createBuffer({size:4*PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE})};
 const horde=await createHorde(device,shared),readback=device.createBuffer({size:4*PARTICLE_BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
  const run=createRun();run.startWave();const total=waveFor(1,1).total;run.takeSpawns(total);
  run.applySettlement({epoch:run.epoch,tick:1,kills:total-2,crushKills:0,leaks:0,earned:0,live:2,invalid:0,maxPacking:0});
  const old=encodeHorde([{kind:'brute',count:2,seed:1}],[{x:15,y:10},{x:18,y:12}]);
  old[P.hp]=17;old[P.vx]=.3;old[P.slow]=.7;old[PARTICLE_FLOATS+P.hp]=23;
  const initial=new Float32Array(4*PARTICLE_FLOATS);initial.set(old);device.queue.writeBuffer(shared.particles,0,initial);
  if(!run.finishWaveEarly().ok||!run.hasRemainingEnemies||!run.startWave().ok||run.waveProgress.live!==2)throw Error('Wave transition discarded live survivors');
  const fresh=encodeHorde([{kind:'runner',count:2,seed:2}],[{x:-10,y:10},{x:-10,y:12}]);
  const encoder=device.createCommandEncoder();horde.encode(encoder,fresh,4);encoder.copyBufferToBuffer(shared.particles,0,readback,0,4*PARTICLE_BYTES);device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);const result=new Float32Array(readback.getMappedRange()).slice();readback.unmap();
  for(let i=0;i<old.length;i++)if(result[i]!==old[i])throw Error(`Previous wave survivor changed at field ${i}`);
  let alive=0;for(let i=0;i<4;i++)alive+=result[i*PARTICLE_FLOATS+P.alive]>.5?1:0;
  if(alive!==4)throw Error('New arrivals did not join existing survivors');
  await device.queue.onSubmittedWorkDone();if(errors.length)throw Error(errors.join('\n'));
  status.textContent='PASS: previous-wave survivors retain position, health, velocity, and slow effects; next-wave arrivals fill dead slots alongside them.';
 }finally{horde.destroy();readback.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();}
}catch(error){status.textContent='FAIL: '+String(error);console.error(error);}

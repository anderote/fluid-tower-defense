import {COUNTER_WORDS, DEFAULT_TUNING, P, PARTICLE_FLOATS, type Effect, type PhysicsFrame, type SharedGPU, type WorldMap} from '../contracts/index.ts';
import {createCombat} from '../sim/combat/index.ts';
import {createPhysics} from '../sim/physics/index.ts';

export type GPUValidationResult = {name:string; passed:boolean; details:string};

const map:WorldMap = {id:'validation',width:160,height:100,obstacles:[],spawn:{x:1,y:1,width:20,height:20},goal:{x:150,y:50},goalRadius:4};
const effect = (kind:Effect['kind'], x:number, y:number, strength:number, damage:number, direction={x:0,y:0}):Effect => ({kind,x,y,radius:8,strength,damage,direction,cone:0,duration:2,source:0});

function particle(x:number, y:number, kind=0, hp=30):number[] {
  const radius=kind===2?.32:kind===1?.18:.22, mass=kind===2?3:kind===1?.7:1;
  return [x,y,0,0,radius,mass,hp,hp,0,0,kind,1,0,0,0,1];
}
function finiteParticles(values:Float32Array):boolean { return values.every(Number.isFinite); }

async function read(device:GPUDevice, source:GPUBuffer, bytes:number):Promise<Uint32Array> {
  const staging=device.createBuffer({size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder(); encoder.copyBufferToBuffer(source,0,staging,0,bytes); device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone(); await staging.mapAsync(GPUMapMode.READ);
  const result=new Uint32Array(staging.getMappedRange()).slice(); staging.unmap(); staging.destroy(); return result;
}
async function readParticles(device:GPUDevice, source:GPUBuffer, count:number):Promise<Float32Array> {
  const bytes=count*PARTICLE_FLOATS*4, staging=device.createBuffer({size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder(); encoder.copyBufferToBuffer(source,0,staging,0,bytes); device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone(); await staging.mapAsync(GPUMapMode.READ);
  const result=new Float32Array(staging.getMappedRange()).slice(); staging.unmap(); staging.destroy(); return result;
}

async function scenario(device:GPUDevice, initial:number[][], frames:readonly {effects?:readonly Effect[]; tuning?:Partial<PhysicsFrame['tuning']>; lab?:boolean}[]) {
  const capacity=Math.max(1,initial.length);
  const shared:SharedGPU={
    particles:device.createBuffer({size:capacity*PARTICLE_FLOATS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),
    counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),capacity,
  };
  const physics=await createPhysics(device,shared), combat=await createCombat(device,shared);
  try {
    device.queue.writeBuffer(shared.particles,0,new Float32Array(initial.flat()));
    device.queue.writeBuffer(shared.counters,0,new Uint32Array(16));
    const history:Uint32Array[]=[];
    for (let tick=0;tick<frames.length;tick++) {
      const step=frames[tick], frame:PhysicsFrame={dt:1/30,tick,count:initial.length,map,effects:step.effects??[],tuning:{...DEFAULT_TUNING,...step.tuning},lab:step.lab??true};
      const encoder=device.createCommandEncoder(); combat.encodeBefore(encoder,{...frame,towers:[]}); physics.encode(encoder,frame); combat.encodeAfter(encoder,{...frame,towers:[]}); device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      history.push(await read(device,shared.counters,64));
    }
    return {particles:await readParticles(device,shared.particles,initial.length), counters:history.at(-1)!, history};
  } finally { physics.destroy(); combat.destroy(); shared.particles.destroy(); shared.counters.destroy(); }
}

async function check(name:string, assertion:()=>Promise<string|undefined>):Promise<GPUValidationResult> {
  try { const details=await assertion(); return details ? {name,passed:false,details} : {name,passed:true,details:'passed'}; }
  catch (error) { return {name,passed:false,details:error instanceof Error ? error.message : String(error)}; }
}

/** Runs compact end-to-end compute checks using private buffers and GPU readback. */
export async function runGPUValidation(device:GPUDevice):Promise<GPUValidationResult[]> {
  return Promise.all([
    check('loose stationary pair',async()=>{
      const out=await scenario(device,[particle(20,20),particle(30,20)],[{tuning:{drive:0,pressure:0,crushDamage:100}}]);
      return !finiteParticles(out.particles) ? 'particle buffer contains non-finite values' : out.counters[0]!==0 ? `unexpected kills ${out.counters[0]}` : undefined;
    }),
    check('compressed cluster crushes once',async()=>{
      const cluster=Array.from({length:12},(_,i)=>particle(50+(i%4)*.03,50+Math.floor(i/4)*.03,2,20));
      const first=await scenario(device,cluster,Array.from({length:5},()=>({tuning:{drive:0,pressure:36,damagePressure:0,crushPressure:1,crushDamage:800}})));
      const before=first.history[3], after=first.history[4];
      if (first.counters[0]===0 || first.counters[1]!==first.counters[0]) return `expected crush kills, got kills=${first.counters[0]} crush=${first.counters[1]}`;
      return after[0]!==before[0] ? `kills changed after dead-particle tick (${before[0]} to ${after[0]})` : undefined;
    }),
    check('blast has directional finite impulse',async()=>{
      const out=await scenario(device,[particle(50,50)],[{effects:[effect('blast',45,50,18,0)],tuning:{drive:0,pressure:0}}]);
      return !finiteParticles(out.particles) ? 'blast produced non-finite particle data' : out.particles[P.vx]<=0 ? `expected positive x impulse, got ${out.particles[P.vx]}` : undefined;
    }),
    check('enemy bounty pays at one-hundredth rate',async()=>{
      const frames=[{effects:[effect('shot',40,50,0,100)],tuning:{drive:0,pressure:0}},{tuning:{drive:0,pressure:0}}];
      const single=await scenario(device,[particle(40,50)],frames);
      if(single.counters[0]!==1 || single.counters[3]!==0) return `expected one kill and no whole Metal, got kills=${single.counters[0]} earned=${single.counters[3]}`;
      const pack=Array.from({length:34},()=>particle(40,50));
      const aggregate=await scenario(device,pack,frames);
      return aggregate.counters[0]!==34 || aggregate.counters[3]!==1 ? `expected 34 kills to pay one Metal, got kills=${aggregate.counters[0]} earned=${aggregate.counters[3]}` : undefined;
    }),
    check('base arrival leaks once',async()=>{
      const out=await scenario(device,[particle(150,50)],[{tuning:{drive:0,pressure:0},lab:false},{tuning:{drive:0,pressure:0},lab:false}]);
      return out.counters[2]!==1 || out.counters[4]!==0 ? `expected one leak and zero live, got leaks=${out.counters[2]} live=${out.counters[4]}` : undefined;
    }),
    check('slow reduces drive but push still moves',async()=>{
      const baseline=await scenario(device,[particle(20,50)],[{tuning:{drive:12,pressure:0}}]);
      const slowed=await scenario(device,[particle(20,50)],[{effects:[effect('slow',20,50,.8,0),effect('push',20,50,4,0,{x:0,y:1})],tuning:{drive:12,pressure:0}}]);
      const vx=slowed.particles[P.vx], vy=slowed.particles[P.vy];
      return !(vx<baseline.particles[P.vx] && vy>0 && slowed.particles[P.slow]>0) ? `expected slower drive plus y impulse; baseline vx=${baseline.particles[P.vx]}, slow vx=${vx}, vy=${vy}, remaining=${slowed.particles[P.slow]}` : undefined;
    }),
  ]);
}

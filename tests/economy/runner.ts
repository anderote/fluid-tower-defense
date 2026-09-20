import {DEFAULT_MAP, compileTower, createParticles} from '../../src/content/index.ts';
import {COUNTER_WORDS, DEFAULT_TUNING, P, PARTICLE_FLOATS, type SharedGPU} from '../../src/contracts/index.ts';
import {createRun} from '../../src/game/index.ts';
import {AUTOSAVE_KEY} from '../../src/persistence/defense.ts';
import {createCombat} from '../../src/sim/combat/index.ts';
import {backupSaves,restoreSaves} from '../e2e/storage.ts';

const frame=document.querySelector<HTMLIFrameElement>('#game')!;
const button=document.querySelector<HTMLButtonElement>('#run')!;
const summary=document.querySelector<HTMLElement>('#summary')!;
const results=document.querySelector<HTMLOListElement>('#results')!;
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,message:string) {
  const start=performance.now();
  while(!check()){if(performance.now()-start>12_000)throw new Error(message);await sleep(50);}
}
function element<T extends HTMLElement=HTMLElement>(selector:string):T {
  const found=frame.contentDocument!.querySelector<T>(selector);
  assert(found,'Missing '+selector);return found;
}
const text=(selector:string)=>element(selector).textContent??'';
function click(selector:string) {
  const control=element<HTMLButtonElement>(selector);
  assert(!control.disabled,'Disabled '+selector);control.click();
}
async function navigate(path:string) {
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Frame navigation timed out')),12_000);
    frame.onload=()=>{clearTimeout(timer);resolve();};frame.src=path;
  });
  if(path!=='about:blank')await until(()=>text('#adapter').includes('/ WEBGPU')&&!!frame.contentDocument!.querySelector('.diagnostics'),'GPU game did not initialize');
}
async function fresh(metal:number) {
  await navigate('about:blank');
  for(const key of Object.keys(localStorage))if(key.startsWith('pressure-front.'))localStorage.removeItem(key);
  const run=createRun();run.model.metal=metal;
  localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState:run.serialize(),map:DEFAULT_MAP,spawnBaseline:DEFAULT_MAP.spawn,builtWalls:[],builtWires:[],difficulty:1,streamWidth:60}));
  await navigate('/');await until(()=>text('#metal')===String(metal),'Starting Metal was not restored');
}
function point(x:number,y:number) {
  const canvas=element<HTMLCanvasElement>('canvas'),r=canvas.getBoundingClientRect(),aspect=r.width/r.height;
  const clientX=r.left+r.width*((x/160*2-1)*Math.min(1,1.6/aspect)+1)/2;
  const clientY=r.top+r.height*((y/100*2-1)*Math.min(1,aspect/1.6)+1)/2;
  for(const type of ['pointermove','pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX,clientY,button:0,buttons:type==='pointerdown'?1:0}));
}
function savedModel() {
  const saved=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)??'null');
  return saved?.runState?JSON.parse(saved.runState).model:undefined;
}
async function reset() {
  click('[data-action="reset"]');click('[data-reset-choice="confirm"]');
  await until(()=>text('#metal')==='1200','Reset did not restore Metal');
}

async function gpuCheck(repulsor:boolean) {
  const adapter=await navigator.gpu.requestAdapter();assert(adapter,'WebGPU adapter unavailable');
  const device=await adapter.requestDevice();
  const errors:string[]=[];device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
  const shared:SharedGPU={
    particles:device.createBuffer({size:2*PARTICLE_FLOATS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),
    counters:device.createBuffer({size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),
    capacity:2,
  };
  const combat=await createCombat(device,shared);
  const source=createParticles(repulsor?[{kind:'shambler',count:2,seed:1}]:[{kind:'shambler',count:1,seed:1},{kind:'brute',count:1,seed:2}],DEFAULT_MAP,2);
  source[P.x]=55;source[P.y]=50;source[PARTICLE_FLOATS+P.x]=repulsor?62:56;source[PARTICLE_FLOATS+P.y]=50;
  device.queue.writeBuffer(shared.particles,0,source);
  const tower={id:1,kind:'repulsor' as const,x:50,y:50,level:0,branch:-1,angle:0,cooldown:0,spent:90};
  const staging=device.createBuffer({size:COUNTER_WORDS*4+source.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
    for(let tick=1;tick<=2;tick++){
      const encoder=device.createCommandEncoder();
      const state={dt:1/60,tick,count:2,map:DEFAULT_MAP,tuning:DEFAULT_TUNING,lab:true,
        effects:repulsor?[]:[{kind:'shot' as const,x:55,y:50,radius:10,strength:0,damage:1000,direction:{x:0,y:0},cone:0,duration:1,source:0}],
        towers:repulsor?[{tower,definition:compileTower(tower)}]:[],
      };
      combat.encodeBefore(encoder,state);combat.encodeAfter(encoder,state);
      if(tick===2){
        encoder.copyBufferToBuffer(shared.counters,0,staging,0,COUNTER_WORDS*4);
        encoder.copyBufferToBuffer(shared.particles,0,staging,COUNTER_WORDS*4,source.byteLength);
      }
      device.queue.submit([encoder.finish()]);
    }
    await staging.mapAsync(GPUMapMode.READ);
    const mapped=staging.getMappedRange();
    const counters=new Uint32Array(mapped,0,COUNTER_WORDS);
    const particles=new Float32Array(mapped,COUNTER_WORDS*4);
    if(repulsor){
      assert(particles[P.vx]>0&&particles[P.vx]<=8.01,'Repulsor push was not reduced');
      assert(particles[PARTICLE_FLOATS+P.vx]===0,'Repulsor hit a target outside its new range');
      assert(particles[PARTICLE_FLOATS+P.hp]===particles[PARTICLE_FLOATS+P.maxHp],'Out-of-range target took damage');
    }else{
      assert(counters[0]===2,'Expected two kills');
      assert(counters[3]===4,'Shambler + brute should pay 1 + 3 Metal exactly once');
    }
    assert(errors.length===0,errors.join('; '));
  } finally {staging.destroy();combat.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();}
}

const cases=[
  {name:'Gun unlock, placement, reload, and reset use only run Metal',run:async()=>{
    await fresh(3120);click('[data-unlock="mortar"]');
    await until(()=>text('#metal')==='120','Unlock did not charge 3000 Metal');
    assert(!element('[data-tower="mortar"]').hasAttribute('data-unlock'),'Unlocked gun still requests research');
    click('[data-tower="mortar"]');point(80,50);
    await until(()=>text('#metal')==='000','Mortar placement did not charge 120 Metal');
    await until(()=>savedModel()?.towers.length===1,'Autosave did not capture the mortar');
    await navigate('/');
    assert(!element('[data-tower="mortar"]').hasAttribute('data-unlock'),'Reload lost the weapon unlock');
    await reset();
    assert(element('[data-tower="mortar"]').hasAttribute('data-unlock'),'Reset retained a weapon unlock');
  }},
  {name:'Stat purchases, affordability, combat upgrades, and save/reset work',run:async()=>{
    await fresh(200);click('#research-tab');click('[data-stat="damage"]');
    await until(()=>text('#metal')==='125','First stat upgrade did not cost 75 Metal');
    click('[data-stat="damage"]');
    await until(()=>text('#metal')==='009','Second stat upgrade did not cost 116 Metal');
    assert(element<HTMLButtonElement>('[data-stat="damage"]').disabled,'Unaffordable stat upgrade is enabled');
    await until(()=>savedModel()?.statRanks.damage===2,'Autosave lost stat ranks');
    await navigate('/');click('#research-tab');
    assert(text('[data-stat="damage"]').includes('2/10'),'Reload lost stat rank');
    click('#build-tab');await reset();click('#research-tab');
    assert(text('[data-stat="damage"]').includes('0/10'),'Reset retained stat ranks');
    click('[data-action="start-wave"]');click('[data-stat="range"]');
    await until(()=>text('[data-stat="range"]').includes('1/10'),'Combat stat purchase failed');
    assert(text('#metal')==='1130','Combat stat purchase did not spend Metal');
    click('#build-tab');click('[data-action="pause"]');
  }},
  {name:'GPU kills pay reduced bounties exactly once',run:()=>gpuCheck(false)},
  {name:'GPU Repulsor has reduced push and cannot hit beyond range 10',run:()=>gpuCheck(true)},
];
button.onclick=async()=>{
  button.disabled=true;results.replaceChildren();summary.textContent='Running…';
  let passed=0;
  try {
    backupSaves(localStorage);
    for(const item of cases){
      const row=document.createElement('li');results.append(row);row.textContent=item.name+' — running';
      try{await item.run();row.className='pass';row.textContent=item.name+' — PASS';passed++;}
      catch(error){row.className='fail';row.textContent=item.name+' — FAIL: '+String(error);}
    }
  } finally {
    await navigate('about:blank');restoreSaves(localStorage);
    summary.textContent=passed+'/'+cases.length+' checks passed';button.disabled=false;
  }
};
if(restoreSaves(localStorage))summary.textContent='Recovered original saves from an interrupted check.';

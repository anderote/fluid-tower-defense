import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {createRenderer} from '../../src/render/index.ts';
import {ENEMIES,compileTower} from '../../src/content/index.ts';
import {AFTERMATH_HEADER_BYTES,AFTERMATH_RECORD_BYTES,CORPSE_CAPACITY,HIT_CAPACITY,AFTERMATH_BATCH} from '../../src/effects/aftermath.ts';
import {DEFAULT_TUNING,type RenderScene,type Tower,type EnemyKind} from '../../src/contracts/index.ts';

const status=document.querySelector('#status')!,results=document.querySelector('#checks')!;
try{
 const canvas=document.querySelector('canvas')!,gpu=await connectGPU(canvas),{device,shared}=gpu;shared.capacity=1024;
 const errors:string[]=[];device.addEventListener('uncapturederror',event=>{errors.push(event.error.message);status.textContent=`FAIL: ${errors.join('; ')}`;});device.pushErrorScope('validation');
 const combat=await createCombat(device,shared);
 const map={id:'aftermath',width:64,height:36,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:100},goalRadius:0};
 const frame:CombatFrame={dt:1/60,tick:60,count:12,map,effects:[],towers:[],tuning:DEFAULT_TUNING,lab:true};
 const kinds:EnemyKind[]=['shambler','runner','softbody','brute'];
 let assertions=0;
 const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);assertions++;};
 async function read(buffer:GPUBuffer){const copy=device.createBuffer({size:buffer.size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(buffer,0,copy,0,buffer.size);device.queue.submit([encoder.finish()]);await copy.mapAsync(GPUMapMode.READ);const data=copy.getMappedRange().slice(0);copy.unmap();copy.destroy();return data;}
 const step=()=>{const encoder=device.createCommandEncoder();combat.encodeBefore(encoder,frame);combat.encodeAfter(encoder,frame);device.queue.submit([encoder.finish()]);};
 function seed(count=12,health=1,generation=1){
  const data=new Float32Array(shared.capacity*16);for(let i=0;i<count;i++){
   const e=ENEMIES[kinds[i%4]],x=count>12?20+(i%32)*.1:12+Math.floor(i/4)*20,y=count>12?15+Math.floor(i/32)*.1:8+(i%4)*6;
   data.set([x,y,2,0,e.radius,e.mass,health,health,0,0,e.index,1,0,0,0,generation],i*16);
  }device.queue.writeBuffer(shared.particles,0,data);return data;
 }
 function showBattle(){
  combat.reset();combat.clearAftermath();frame.count=12;frame.tick=60;frame.towers=[];
  const data=seed();for(let i=8;i<12;i++)data[i*16+14]=100;
  device.queue.writeBuffer(shared.particles,0,data);
  frame.effects=[{kind:'shot',x:12,y:17,radius:12,strength:0,damage:100,direction:{x:1,y:0},cone:0,duration:0,source:0},{kind:'blast',x:30,y:17,radius:12,strength:0,damage:100,direction:{x:1,y:0},cone:0,duration:0,source:0}];step();frame.effects=[];
 }
 // Real combat deaths must publish once and survive immediate slot reuse.
 showBattle();let data=await read(shared.aftermath!),heads=new Uint32Array(data,0,4),events=new Float32Array(data,AFTERMATH_HEADER_BYTES);
 assert(heads[2]===12,'Not all three death causes were captured');
 assert([0,1,2].every(cause=>Array.from({length:12},(_,i)=>events[i*12+7]).filter(value=>value===cause).length===4),'Death causes were not separated');
 const captured=events.slice(0,12*12);seed(12,30,2);frame.tick++;step();data=await read(shared.aftermath!);events=new Float32Array(data,AFTERMATH_HEADER_BYTES);
 assert(captured.every((v,i)=>v===events[i]),'Slot reuse erased persistent corpses');assert(new Uint32Array(data)[2]===12,'Slot reuse duplicated deaths');
 // A nonlethal hit emits a directional spray and does not create a corpse.
 combat.clearAftermath();combat.reset();seed(1,30,3);frame.count=1;const tower:Tower={id:1,kind:'autocannon',x:4,y:8,angle:0,level:0,branch:-1,cooldown:0,spent:0};
 frame.towers=[{tower,definition:{...compileTower(tower),damage:5,force:2}}];frame.tick++;step();data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);
 const hits=new Float32Array(data,AFTERMATH_HEADER_BYTES+CORPSE_CAPACITY*AFTERMATH_RECORD_BYTES);
 assert(heads[2]===0&&heads[3]===1&&hits[4]>.99&&Math.abs(hits[5])<.01,'Bullet hit spray is missing or points backward');
 // Tesla remains owned by its existing custom effects, even when lethal.
 combat.clearAftermath();combat.reset();seed(1);tower.kind='tesla';frame.towers=[{tower,definition:{...compileTower(tower),damage:100}}];frame.tick++;step();data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);
 assert(heads[2]===0&&heads[3]===0,'Generic gore overrode Tesla electrocution');
 // Living electrical hits also remain exclusive, while ordinary leaked units leave no corpse.
 combat.clearAftermath();combat.reset();seed(1,1000,2);frame.tick++;step();data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);
 assert(heads[2]===0&&heads[3]===0,'Generic hit spray overrode nonlethal Tesla');
 combat.reset();seed(1,30,3);frame.towers=[];frame.lab=false;frame.map={...map,goal:{x:12,y:8},goalRadius:2};frame.tick++;step();data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);
 assert(heads[2]===0&&heads[3]===0,'A leaked enemy produced a casualty');frame.lab=true;frame.map=map;
 // Overflow is deliberately bounded; simultaneous writers cannot wrap onto each other.
 combat.clearAftermath();combat.reset();frame.count=1024;frame.towers=[];seed(1024);frame.effects=[{kind:'blast',x:20,y:15,radius:100,strength:0,damage:1000,direction:{x:1,y:0},cone:0,duration:0,source:0}];frame.tick++;step();data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);
 assert(heads[2]===AFTERMATH_BATCH,'Burst overflow did not respect the bounded batch');
 for(let cycle=0;cycle<5;cycle++){seed(1024,1,cycle+2);frame.tick++;step();}
 data=await read(shared.aftermath!);heads=new Uint32Array(data,0,4);assert(heads[2]===CORPSE_CAPACITY&&heads[0]<CORPSE_CAPACITY&&heads[3]<=HIT_CAPACITY,'Ring overflow corrupted its bounds');
 assert(new Float32Array(data,AFTERMATH_HEADER_BYTES).every(Number.isFinite),'Non-finite event data');
 combat.clearAftermath();data=await read(shared.aftermath!);assert(new Uint8Array(data).every(v=>v===0),'Reset retained old aftermath');
 showBattle();const renderer=await createRenderer(device,gpu.context,gpu.format,shared,canvas);
 const scene:RenderScene={count:12,time:1,map,towers:[],effects:[],heatmap:false,selection:null};
 let start=performance.now(),active=true;
 document.querySelector('#reuse')!.addEventListener('click',()=>{seed(12,30,9);});
 document.querySelector('#clear')!.addEventListener('click',()=>{combat.clearAftermath();renderer.clearAftermath?.();});
 document.querySelector('#replay')!.addEventListener('click',()=>{showBattle();renderer.clearAftermath?.();start=performance.now();});
 function draw(){if(!active)return;const choice=(document.querySelector('#age') as HTMLSelectElement).value;const age=choice==='auto'?(performance.now()-start)/1000:Number(choice);scene.time=1+age;scene.heavyExplosions=age<1.65?[{x:30,y:17,kind:'mortar',age,life:1.65,scale:1,direction:{x:1,y:0},serial:1}]:[];const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);requestAnimationFrame(draw);}draw();
 await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
 status.textContent=`PASS: ${assertions} GPU checks · slot reuse, hit direction, Tesla exclusion, overflow and reset.`;results.textContent='Simulation records confirmed kills; the visual pools retain the aftermath independently.\nPause the timeline to inspect airborne fragments and their ground shadows.';
 window.addEventListener('pagehide',()=>{active=false;renderer.destroy();combat.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;console.error(error);}

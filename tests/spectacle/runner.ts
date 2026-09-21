import {connectGPU} from '../../src/runtime/gpu.ts';
import {createCombat,type CombatFrame} from '../../src/sim/combat/index.ts';
import {createRenderer} from '../../src/render/index.ts';
import {COUNTER_WORDS,DEFAULT_TUNING,P,type Tower,type TowerDef} from '../../src/contracts/index.ts';
import {TOWERS} from '../../src/content/index.ts';
import {TESLA_LINKS} from '../../src/effects/tesla.ts';
const status=document.querySelector('#status')!;
function assert(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
try{
 const canvas=document.querySelector('canvas')!,gpu=await connectGPU(canvas),{device,shared}=gpu;
 device.addEventListener('uncapturederror',e=>{status.textContent='FAIL: '+e.error.message;});device.pushErrorScope('validation');
 const combat=await createCombat(device,shared);shared.shotState=combat.shotState;
 const tower:Tower={id:1,kind:'tesla',x:15,y:16,angle:0,level:0,branch:-1,cooldown:0,spent:600};
 const map={id:'spectacle',width:80,height:40,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:30,y:16},goalRadius:0};
 const definition:TowerDef={...TOWERS.tesla,damage:10,cooldown:0,overload:true};
 const frame:CombatFrame={dt:1/60,tick:60,count:12,map,effects:[],tuning:DEFAULT_TUNING,lab:true,towers:[{tower,definition}]};
 const seed=(positions:number[][],hp=100)=>{const data=new Float32Array(positions.length*16);positions.forEach(([x,y,packing=0],i)=>data.set([x,y,0,0,.4125,1,hp,hp,packing,0,0,1,0,0,0,1],i*16));device.queue.writeBuffer(shared.particles,0,data);device.queue.writeBuffer(shared.counters,0,new Uint32Array(COUNTER_WORDS));frame.count=positions.length;};
 const read=async(buffer:GPUBuffer,size:number,offset=0)=>{const staging=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(buffer,offset,staging,0,size);device.queue.submit([encoder.finish()]);await staging.mapAsync(GPUMapMode.READ);const data=new Float32Array(staging.getMappedRange()).slice();staging.unmap();staging.destroy();return data;};
 const step=()=>{const encoder=device.createCommandEncoder();combat.encodeBefore(encoder,frame);combat.encodeAfter(encoder,frame);device.queue.submit([encoder.finish()]);frame.tick++;};
 const chain=Array.from({length:12},(_,i)=>[30+i*3,16+(i%2)*2]);let checks=0;
 for(let shot=1;shot<=6;shot++){
  seed(chain);step();const links=await read(shared.teslaState!,TESLA_LINKS*16);const charge=await read(shared.teslaState!,16,64*TESLA_LINKS*16);const particles=await read(shared.particles,12*64);
  assert(links.filter((_,i)=>i%4===2&&links[i]>=0).length===(shot===6?12:4),`Wrong chain count on shot ${shot}`);checks++;
  assert(Math.abs(charge[0]-(shot%6)/6)<.0001&&charge[1]===(shot===6?1:0),'Charge meter disagrees with actual shot');checks++;
  assert(Math.abs(particles[P.hp]-(shot===6?70:90))<.001,'Overload primary damage mismatch');checks++;
 }
 seed(chain);step();let charge=await read(shared.teslaState!,16,64*TESLA_LINKS*16);assert(charge[1]===0,'Overload continued after sixth shot');checks++;
 combat.reset();tower.kind='crusher';tower.x=30;tower.y=16;frame.towers=[{tower,definition:TOWERS.crusher}];
 seed([[30,16],[33.9,20.9],[34.1,16],[30,21.1]],50);step();let particles=await read(shared.particles,4*64);assert(particles[P.hp]===50,'Crusher fired automatically');checks++;
 frame.effects=[{kind:'crush',x:30,y:16,radius:6,damage:60,strength:18,direction:{x:0,y:1},cone:0,duration:.7,source:1}];step();
 particles=await read(shared.particles,4*64);assert(particles[P.alive]===-1&&particles[16+P.alive]===-1,'Inside jaw targets survived');assert(particles[32+P.hp]===50&&particles[48+P.hp]===50,'Crusher damaged enemies outside jaws');checks+=2;
 const counts=new Uint32Array((await read(shared.counters,COUNTER_WORDS*4)).buffer);assert(counts[0]===2&&counts[1]===2&&counts[16]===2,'Crusher kills missing from totals or tower attribution');checks++;
 combat.reset();seed([[30,16,1],[31,16,2]],200);step();particles=await read(shared.particles,2*64);assert(Math.abs((200-particles[16+P.hp])/(200-particles[P.hp])-2)<.001,'Dense crowd bonus missing');checks++;
 // A later gate effect must not steal a kill already dealt by another tower.
 combat.reset();tower.kind='tesla';tower.x=15;frame.towers=[{tower,definition:{...definition,damage:100,overload:false}},{tower:{...tower,id:2,kind:'crusher',x:30},definition:TOWERS.crusher}];
 frame.effects=[{...frame.effects[0],source:2}];seed([[30,16]],50);step();
 const attribution=new Uint32Array((await read(shared.counters,COUNTER_WORDS*4)).buffer);assert(attribution[16]===1&&attribution[17]===0&&attribution[1]===0,'Gate stole an already-dead Tesla victim');checks++;
 // Use the production renderer to inspect both machines at actual GPU hit ages.
 combat.reset();tower.kind='tesla';tower.x=15;frame.effects=[];frame.towers=[{tower,definition}];
 const gate:Tower={...tower,id:2,kind:'crusher',x:47,y:28,spent:450};
 const renderer=await createRenderer(device,gpu.context,gpu.format,shared,canvas);let start=performance.now();
 const replay=()=>{combat.reset();frame.tick=60;for(let i=0;i<6;i++){seed(chain);step();}start=performance.now();};replay();
 document.querySelector('#replay')!.addEventListener('click',replay);
 let raf=0;const draw=()=>{const age=(document.querySelector('#hold') as HTMLInputElement).checked?.08:(performance.now()-start)/1000;gate.crusherAnimation=Math.max(0,.7-age);gate.cooldown=Math.max(0,8-age);const e=device.createCommandEncoder();renderer.encode(e,{count:12,time:65/60+age,map,towers:[tower,gate],effects:[],heatmap:false,selection:null});device.queue.submit([e.finish()]);raf=requestAnimationFrame(draw);};draw();
 await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);status.textContent=`PASS: ${checks} GPU checks — sixth shot, twelve links, damage, rectangle bounds, density bonus, kill credit and renderer.`;
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer.destroy();combat.destroy();device.destroy();});
}catch(error){status.textContent='FAIL: '+String(error);console.error(error);}

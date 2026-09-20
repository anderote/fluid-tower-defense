import {backupSaves,restoreSaves} from './storage.ts';
// Browser-native E2E checks: actual UI events, actual WebGPU, no mocked simulation.
const frame=document.querySelector<HTMLIFrameElement>('#game')!;
const results=document.querySelector<HTMLOListElement>('#results')!;
const summary=document.querySelector<HTMLElement>('#summary')!;
const button=document.querySelector<HTMLButtonElement>('#run')!;
const checkpointKey='pressure-front.checkpoint.v1';
const savePrefix='pressure-front.';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
async function until(check:()=>boolean,message:string,timeout=12000){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw new Error(message);await sleep(50);}}
function doc(){return frame.contentDocument!;}
function element<T extends HTMLElement=HTMLElement>(selector:string){const found=doc().querySelector<T>(selector);assert(found,`Missing ${selector}`);return found;}
function click(selector:string){const control=element<HTMLButtonElement>(selector);assert(!control.disabled,`Disabled ${selector}`);control.click();}
function text(selector:string){return element(selector).textContent??'';}
function flow(value:number){const input=element<HTMLInputElement>('#difficulty');input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}
function point(x:number,y:number){
 const canvas=element<HTMLCanvasElement>('canvas'),r=canvas.getBoundingClientRect(),aspect=r.width/r.height;
 const sx=Math.min(1,1.6/aspect),sy=Math.min(1,aspect/1.6);
 const clientX=r.left+r.width*((x/160*2-1)*sx+1)/2,clientY=r.top+r.height*((y/100*2-1)*sy+1)/2;
 canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX,clientY}));
 canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX,clientY,button:0,buttons:1}));
 canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX,clientY,button:0}));
}
function snapshot(){click('[data-action="save"]');assert(text('#message').includes('checkpoint saved'),'Save failed: '+text('#message'));return JSON.parse(localStorage.getItem(checkpointKey)!);}
function hasRect(rects:{x:number;y:number}[],x:number,y:number){return rects.some(r=>r.x===x&&r.y===y);}
function freshStorage(){for(const key of Object.keys(localStorage))if(key.startsWith(savePrefix))localStorage.removeItem(key);}
async function loadFrame(path:string){
 await new Promise<void>((resolve,reject)=>{
  const loaded=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{frame.removeEventListener('load',loaded);reject(new Error('Frame navigation timed out: '+path));},12000);
  frame.addEventListener('load',loaded,{once:true});frame.src=path;
 });
}
async function navigate(path='/'){
 await loadFrame(path);
 await until(()=>!!doc().querySelector('#adapter')?.textContent?.includes('/ WEBGPU'),'Game failed to initialize WebGPU');
 await until(()=>text('#metal')!=='000','Game failed to initialize UI');
}
async function fresh(){await loadFrame('about:blank');freshStorage();await navigate();}
const cases:{name:string;run:()=>Promise<void>}[]=[
 {name:'Checkpoint survives later autosaves and restores structures, Metal, and flow',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,22);await until(()=>text('#metal')==='590','Wall was not charged');flow(2);snapshot();
  click('[data-action="wire-tool"]');point(30,22);flow(3);await until(()=>text('#metal')==='545','Wire was not charged');
  await until(()=>{const raw=localStorage.getItem('pressure-front.autosave.v1');return !!raw&&JSON.parse(raw).difficulty===3;},'Autosave did not capture changes');
  click('[data-action="load"]');await until(()=>text('#metal')==='590','Checkpoint did not restore Metal');assert(element<HTMLInputElement>('#difficulty').value==='2','Flow was not restored');
  const restored=snapshot();assert(restored.builtWalls.length===1&&restored.builtWires.length===0,'Wrong structures restored');
 }},
 {name:'Demolishing wire removes its collision obstacle immediately',run:async()=>{
  await fresh();click('[data-action="wire-tool"]');point(30,22);await until(()=>text('#metal')==='605','Wire was not built');
  click('[data-action="demolish-tool"]');point(30,22);await until(()=>text('#metal')==='627','Wire refund was not paid');
  const saved=snapshot();assert(saved.builtWires.length===0,'Wire record remains');assert(!hasRect(saved.map.obstacles,28,20),'Invisible wire collision remains after demolition');
 }},
 {name:'Reset removes paid terrain and restores a fresh economy',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,22);click('[data-action="wire-tool"]');point(30,22);
  click('[data-action="reset"]');await until(()=>text('#metal')==='650','Reset did not restore starting Metal');
  const saved=snapshot();assert(saved.builtWalls.length===0&&saved.builtWires.length===0,'Reset kept free structures');assert(!hasRect(saved.map.obstacles,20,20)&&!hasRect(saved.map.obstacles,28,20),'Reset kept terrain collisions');
 }},
 {name:'Ordinary clicks can mount towers; mounted walls cannot be demolished',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,22);click('[data-tower="repulsor"]');point(21.7,22.3);
  await until(()=>text('#metal')==='500','Click did not snap onto the player-wall mount');
  const saved=snapshot(),run=JSON.parse(saved.runState);assert(run.model.towers[0].x===22&&run.model.towers[0].y===22,'Mounted tower is not centered');
  click('[data-action="demolish-tool"]');point(22,22);await until(()=>text('#message').includes('Sell the mounted tower'),'Mounted wall demolition was not blocked');
 }},
 {name:'Tower inspector tracks the selected tower and stays inside the arena',run:async()=>{
  await fresh();click('[data-tower="repulsor"]');point(40,50);await until(()=>text('#metal')==='560','Tower was not placed');
  click('[data-tower="repulsor"]');point(40,50);
  await until(()=>element('.selected-popup').classList.contains('has-selection')&&!element('.selected-popup').hidden&&element('.selected-popup').getBoundingClientRect().width>0,'Inspector did not open');
  const canvas=element('canvas').getBoundingClientRect(),arena=element('.arena').getBoundingClientRect(),popup=element('.selected-popup').getBoundingClientRect();
  const sx=Math.min(1,1.6/(canvas.width/canvas.height));
  const expectedX=canvas.left+canvas.width*((40/160*2-1)*sx+1)/2;
  assert(Math.abs(popup.left+popup.width/2-expectedX)<2,'Inspector is horizontally detached from its tower');
  assert(Math.abs(popup.top+popup.height/2-(canvas.top+canvas.height/2))<2,'Inspector is vertically detached from its tower');
  assert(popup.left>=arena.left&&popup.right<=arena.right&&popup.top>=arena.top&&popup.bottom<=arena.bottom,'Inspector escaped the arena');
 }},
 {name:'Damaged Command profiles recover and valid upgrades remain purchasable',run:async()=>{
  await fresh();localStorage.setItem('pressure-front.command-profile.v1',JSON.stringify({version:1,xp:200,ranks:{damage:-1,rate:2.5,range:999999,force:'oops'},unlockedTier:'oops'}));await navigate();click('#research-tab');
  assert(text('#command-xp')==='200 XP','Recovery discarded valid XP');assert(text('[data-meta="rate"]').includes('2/10'),'Valid rank was not recovered');assert(text('[data-meta="range"]').includes('10/10'),'Rank was not capped');
  click('[data-meta="damage"]');await until(()=>text('#command-xp')==='125 XP','Recovered profile could not purchase an upgrade');
  await navigate();click('#research-tab');assert(text('[data-meta="damage"]').includes('1/10'),'Recovered purchase did not persist');
 }},
 {name:'Keyboard shortcuts respect controls, browser modifiers, and held keys',run:async()=>{
  await fresh();const research=element('#research-tab');research.focus();
  const space=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});research.dispatchEvent(space);
  assert(!space.defaultPrevented,'Space activation on a button was intercepted');await sleep(200);assert(text('#phase')==='PREPARATION','Button Space started combat');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',ctrlKey:true,bubbles:true}));await sleep(200);assert(!element('[data-action="wall-tool"]').classList.contains('active'),'Browser modifier selected a build tool');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true}));await until(()=>element('[data-action="wall-tool"]').classList.contains('active'),'Wall shortcut did not activate');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',repeat:true,bubbles:true}));await sleep(200);assert(element('[data-action="wall-tool"]').classList.contains('active'),'Held shortcut toggled the tool off');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!element('[data-action="wall-tool"]').classList.contains('active'),'Escape did not cancel placement');
 }},
 {name:'Research buttons retain keyboard focus between telemetry updates',run:async()=>{
  await fresh();click('#research-tab');const control=element<HTMLButtonElement>('[data-command="repulsor-impact-1"]');control.focus();
  await sleep(600);assert(control.isConnected,'Research controls were recreated during telemetry refresh');assert(doc().activeElement===control,'Keyboard focus was lost during telemetry refresh');
 }},
 {name:'Research prerequisites unlock after purchase and remain locked in combat',run:async()=>{
  await fresh();click('#research-tab');assert(element<HTMLButtonElement>('[data-command="repulsor-impact-2"]').disabled,'Rank II should be locked');
  click('[data-command="repulsor-impact-1"]');await until(()=>!element<HTMLButtonElement>('[data-command="repulsor-impact-2"]').disabled,'Rank II did not unlock');
  click('[data-action="start-wave"]');await until(()=>text('#phase')==='COMBAT','Wave did not start');assert(element<HTMLButtonElement>('[data-command="repulsor-impact-2"]').disabled,'Research is enabled in combat');
  click('#build-tab');click('[data-action="pause"]');
 }},
];
button.onclick=async()=>{
 button.disabled=true;results.replaceChildren();summary.textContent='Running…';
 let passed=0;
 try{backupSaves(localStorage);}catch(error){summary.textContent='Could not back up saves: '+String(error);button.disabled=false;return;}
 try{for(const item of cases){const row=document.createElement('li');row.textContent=item.name+' — running';results.append(row);try{await item.run();row.className='pass';row.textContent=item.name+' — PASS';passed++;}catch(error){row.className='fail';row.textContent=item.name+' — FAIL: '+String(error);}}}
 finally{
  try{await loadFrame('about:blank');restoreSaves(localStorage);summary.textContent=`${passed}/${cases.length} checks passed`;}
  catch(error){summary.textContent='Save recovery required: '+String(error)+'. Reload this page to retry.';}
  button.disabled=false;
 }
};

try{if(restoreSaves(localStorage))summary.textContent='Recovered original saves from an interrupted run.';}catch(error){summary.textContent='Save recovery failed: '+String(error);button.disabled=true;}

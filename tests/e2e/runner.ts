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
async function fresh(path='/'){await loadFrame('about:blank');freshStorage();await navigate(path);}
const cases:{name:string;run:()=>Promise<void>}[]=[
 {name:'Crusher and overload: placement, research, persistence, manual slam, pause and recharge',run:async()=>{
  await fresh();
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'9',bubbles:true}));
  await until(()=>element('[data-tower="crusher"]').classList.contains('active'),'9 did not select Crusher Gate');
  point(40,48);await until(()=>text('#metal')==='2550','Crusher did not place: '+text('#message'));
  assert(element<HTMLButtonElement>('[data-action="slam-gates"]').disabled,'Preparation allowed a slam');
  click('[data-tower="tesla"]');point(36,60);await until(()=>text('#metal')==='1950','Tesla did not place');
  click('#research-tab');click('[data-command="tesla-overload"]');await until(()=>text('#metal')==='1500','Overload research did not spend 450 Metal');
  const saved=snapshot(),model=JSON.parse(saved.runState).model;assert(model.towers.some((t:{kind:string})=>t.kind==='crusher')&&model.commandUpgrades.includes('tesla-overload'),'Checkpoint omitted new equipment');
  await until(()=>{const raw=localStorage.getItem('pressure-front.autosave.v1');return !!raw&&JSON.parse(JSON.parse(raw).runState).model.commandUpgrades.includes('tesla-overload');},'Autosave did not record overload');
  await navigate();assert(text('#metal')==='1500','Reload changed equipment costs');assert(!element('#crusher-controls').hidden,'Reload lost crusher controls');
  click('#research-tab');assert(text('[data-command="tesla-overload"]').includes('INSTALLED'),'Reload lost overload research');click('#build-tab');
  click('[data-action="start-wave"]');await until(()=>!element<HTMLButtonElement>('[data-action="slam-gates"]').disabled,'Combat did not charge gate');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true}));await until(()=>text('#crusher-status').includes('0/1'),'G did not slam gate');
  click('[data-action="pause"]');await sleep(250);const paused=text('#crusher-status');await sleep(1200);assert(text('#crusher-status')===paused,'Paused gate kept recharging');
  assert(element<HTMLButtonElement>('[data-action="slam-gates"]').disabled,'Paused gate can fire');
  click('[data-action="pause"]');await until(()=>!element<HTMLButtonElement>('[data-action="slam-gates"]').disabled,'Gate did not recharge',15000);
  click('[data-action="slam-gates"]');await until(()=>text('#crusher-status').includes('0/1'),'Button did not slam recharged gate');
  click('[data-action="pause"]');
 }},

 {name:'Checkpoint survives later autosaves and restores structures, Metal, and flow',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,22);await until(()=>text('#metal')==='2940','Wall was not charged');flow(2);snapshot();
  click('[data-action="wire-tool"]');point(30,22);flow(3);await until(()=>text('#metal')==='2895','Wire was not charged');
  await until(()=>{const raw=localStorage.getItem('pressure-front.autosave.v1');return !!raw&&JSON.parse(raw).difficulty===3;},'Autosave did not capture changes');
  click('[data-action="load"]');await until(()=>text('#metal')==='2940','Checkpoint did not restore Metal');assert(element<HTMLInputElement>('#difficulty').value==='2','Flow was not restored');
  const restored=snapshot();assert(restored.builtWalls.length===1&&restored.builtWires.length===0,'Wrong structures restored');
 }},
 {name:'Corrupt tower checkpoints fail without changing the current defense',run:async()=>{
  await fresh();click('[data-tower="repulsor"]');point(22,46);await until(()=>text('#metal')==='2910','Tower was not placed');
  const saved=snapshot(),run=JSON.parse(saved.runState);run.model.towers[0].veterancy='broken';saved.runState=JSON.stringify(run);localStorage.setItem(checkpointKey,JSON.stringify(saved));
  click('[data-action="load"]');await until(()=>text('#message').toLowerCase().includes('invalid'),'Corrupt checkpoint did not report invalid data');
  assert(text('#metal')==='2910','Failed load changed Metal');const current=JSON.parse(snapshot().runState);assert(current.model.towers.length===1&&current.model.towers[0].veterancy===0,'Failed load changed the tower');
 }},
 {name:'Demolishing wire removes its collision obstacle immediately',run:async()=>{
  await fresh();click('[data-action="wire-tool"]');point(30,22);await until(()=>text('#metal')==='2955','Wire was not built');
  click('[data-action="demolish-tool"]');point(30,22);await until(()=>text('#metal')==='2977','Wire refund was not paid');
  const saved=snapshot();assert(saved.builtWires.length===0,'Wire record remains');assert(!hasRect(saved.map.obstacles,28,20),'Invisible wire collision remains after demolition');
 }},
 {name:'Reset removes paid terrain and restores a fresh economy',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,22);click('[data-action="wire-tool"]');point(30,22);
  click('[data-action="reset"]');click('[data-reset-choice="confirm"]');await until(()=>text('#metal')==='3000','Reset did not restore starting Metal');
  const saved=snapshot();assert(saved.builtWalls.length===0&&saved.builtWires.length===0,'Reset kept free structures');assert(!hasRect(saved.map.obstacles,20,20)&&!hasRect(saved.map.obstacles,28,20),'Reset kept terrain collisions');
 }},
 {name:'Ordinary clicks can mount towers; mounted walls cannot be demolished',run:async()=>{
  await fresh();click('[data-action="wall-tool"]');point(22,46);click('[data-tower="repulsor"]');point(21.7,46.3);
  await until(()=>text('#metal')==='2850','Click did not snap onto the player-wall mount');
  const saved=snapshot(),run=JSON.parse(saved.runState);assert(run.model.towers[0].x===22&&run.model.towers[0].y===46,'Mounted tower is not centered');
  click('[data-action="demolish-tool"]');point(22,46);await until(()=>text('#message').includes('Sell the mounted turret'),'Mounted wall demolition was not blocked');
 }},
 {name:'Starting indestructible walls accept turret mounts',run:async()=>{
  await fresh('/?map=3');click('[data-tower="repulsor"]');point(46.8,22.9);
  await until(()=>text('#metal')==='2910','Starting wall did not accept the turret');
  const saved=snapshot(),run=JSON.parse(saved.runState);assert(run.model.towers[0].x===46&&run.model.towers[0].y===22,'Starting-wall turret did not snap to its wall cell');
 }},
 {name:'Forest cliffs reject turret mounts without spending Metal',run:async()=>{
  await fresh();click('[data-tower="repulsor"]');point(50,22);
  await until(()=>text('#message').includes('blocked'),'Cliff did not reject the turret');
  assert(text('#metal')==='3000','Blocked cliff placement spent Metal');
  assert(JSON.parse(snapshot().runState).model.towers.length===0,'Cliff accepted a turret');
 }},
 {name:'Turrets placed at map edges sit flush inside every boundary',run:async()=>{
  await fresh();click('[data-tower="repulsor"]');
  for(const [x,y] of [[0,10],[160,20],[40,0],[40,100]])point(x,y);
  await until(()=>text('#metal')==='2640','Edge placements did not spend Metal');
  await until(()=>{const raw=localStorage.getItem('pressure-front.autosave.v1');return !!raw&&JSON.parse(JSON.parse(raw).runState).model.towers.length===4;},'Autosave did not capture edge placements');
  const saved=JSON.parse(localStorage.getItem('pressure-front.autosave.v1')!),run=JSON.parse(saved.runState),positions=run.model.towers.map((tower:{x:number;y:number})=>[tower.x,tower.y]);
  for(const expected of [[1.25,10],[158.75,20],[40,1.25],[40,98.75]])assert(positions.some((position:number[])=>Math.abs(position[0]-expected[0])<.01&&Math.abs(position[1]-expected[1])<.01),`Missing edge turret at ${expected}; got ${JSON.stringify(positions)}`);
 }},
 {name:'Tower inspector tracks the selected tower and stays inside the arena',run:async()=>{
  await fresh();click('[data-tower="repulsor"]');point(40,50);await until(()=>text('#metal')==='2910','Tower was not placed');
  click('[data-tower="repulsor"]');point(40,50);
  await until(()=>element('.selected-popup').classList.contains('has-selection')&&!element('.selected-popup').hidden&&element('.selected-popup').getBoundingClientRect().width>0,'Inspector did not open');
  const canvas=element('canvas').getBoundingClientRect(),arena=element('.arena').getBoundingClientRect(),popup=element('.selected-popup').getBoundingClientRect();
  const sx=Math.min(1,1.6/(canvas.width/canvas.height));
  const expectedX=canvas.left+canvas.width*((40/160*2-1)*sx+1)/2;
  assert(Math.abs(popup.left-expectedX-18)<2,'Inspector is horizontally detached from its tower');
  assert(Math.abs(popup.top+popup.height/2-(canvas.top+canvas.height/2))<2,'Inspector is vertically detached from its tower');
  assert(popup.left>=arena.left&&popup.right<=arena.right&&popup.top>=arena.top&&popup.bottom<=arena.bottom,'Inspector escaped the arena');
 }},
 {name:'Run stat upgrades spend Metal and survive reload',run:async()=>{
  await fresh();click('#research-tab');
  click('[data-stat="damage"]');await until(()=>text('#metal')==='2925','Stat upgrade did not spend Metal');
  assert(text('[data-stat="damage"]').includes('1/10'),'Stat rank did not advance');
  await until(()=>{const raw=localStorage.getItem('pressure-front.autosave.v1');return !!raw&&JSON.parse(JSON.parse(raw).runState).model.statRanks.damage===1;},'Autosave did not capture stat research');
  await navigate();click('#research-tab');
  assert(text('[data-stat="damage"]').includes('1/10'),'Stat upgrade did not survive reload');
  assert(text('#metal')==='2925','Reload changed research spending');
 }},
 {name:'Keyboard shortcuts respect controls, browser modifiers, and held keys',run:async()=>{
  await fresh();const research=element('#research-tab');research.focus();
  const space=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});research.dispatchEvent(space);
  assert(!space.defaultPrevented,'Space activation on a button was intercepted');await sleep(200);assert(text('#phase')==='PREPARATION','Button Space started combat');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',ctrlKey:true,bubbles:true}));await sleep(200);assert(!element('[data-action="wall-tool"]').classList.contains('active'),'Browser modifier selected a build tool');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true}));await until(()=>element('[data-action="wall-tool"]').classList.contains('active'),'Wall shortcut did not activate');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'q',repeat:true,bubbles:true}));await sleep(200);assert(element('[data-action="wall-tool"]').classList.contains('active'),'Held shortcut toggled the tool off');
  doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!element('[data-action="wall-tool"]').classList.contains('active'),'Escape did not cancel placement');
  point(22,22);await sleep(200);assert(text('#metal')==='3000','Wall placement remained active after Escape');
  click('[data-tower="repulsor"]');doc().body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));point(30,22);await sleep(200);assert(text('#metal')==='3000','Tower placement remained active after Escape');
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
 const selectedCases=cases.filter(item=>!new URLSearchParams(location.search).has("spectacle")||item.name.startsWith("Crusher and overload"));
 try{for(const item of selectedCases){const row=document.createElement('li');row.textContent=item.name+' — running';results.append(row);try{await item.run();row.className='pass';row.textContent=item.name+' — PASS';passed++;}catch(error){row.className='fail';row.textContent=item.name+' — FAIL: '+String(error);}}}
 finally{
  try{await loadFrame('about:blank');restoreSaves(localStorage);summary.textContent=`${passed}/${selectedCases.length} checks passed`;}
  catch(error){summary.textContent='Save recovery required: '+String(error)+'. Reload this page to retry.';}
  button.disabled=false;
 }
};

try{if(restoreSaves(localStorage))summary.textContent='Recovered original saves from an interrupted run.';}catch(error){summary.textContent='Save recovery failed: '+String(error);button.disabled=true;}

import { connectGPU } from '../runtime/gpu.ts';
import { verifyABI } from '../runtime/abi-check.ts';
import { FixedClock } from '../runtime/clock.ts';
import { FrameMetrics } from '../runtime/metrics.ts';
import { SettlementReader } from '../runtime/readback.ts';
import { createLevelEditor, validateEditorMap } from '../editor/index.ts';
import '../editor/style.css';
import { createUI } from '../ui/index.ts';
import { createRenderer } from '../render/index.ts';
import {createBoss} from '../sim/bosses/index.ts';
import { createPhysics } from '../sim/physics/index.ts';
import { createCombat, type CombatFrame } from '../sim/combat/index.ts';
import { barbedWireStats, createParticles, DEFAULT_MAP, compileTower, TOWERS } from '../content/index.ts';
import { buildNavigation, canPlace } from '../navigation/index.ts';
import { createRun } from '../game/index.ts';
import { DEFAULT_TUNING, PARTICLE_FLOATS, type UIState, type GameAction, type Effect, type Vec2, type Rect, type Settlement, type VisualParticle, type WorldMap } from '../contracts/index.ts';

const root=document.querySelector<HTMLElement>('#app')!;
const params=new URLSearchParams(location.search);
if(params.has('validate')) {
 const {showValidation}=await import('./validation-page.ts');await showValidation(root);
} else {
const run=createRun();
const state:UIState={mode:params.get('mode')==='lab'?'lab':'game',phase:'preparation',paused:false,fps:0,frameMs:0,population:10000,capacity:65536,kills:0,crushKills:0,leaks:0,earned:0,maxPressure:0,metal:650,baseHealth:100,wave:0,waveCount:5,difficulty:1,selected:null,selectedKind:null,heatmap:false,tool:'blast',message:'Connecting to local GPU…',adapter:'WebGPU',bonusChoices:[],commandUpgrades:[]};
let handleAction:(action:GameAction)=>void=()=>{};
const ui=createUI(root,action=>handleAction(action));
try {
 const gpu=await connectGPU(ui.canvas);
 let failed=false;
 function fail(error:unknown){if(failed)return;failed=true;state.message=String(error instanceof Error?error.message:error);state.paused=true;ui.update(state);console.error(error);}
 gpu.device.addEventListener('uncapturederror',event=>fail(event.error.message));
 void gpu.device.lost.then(info=>fail(`GPU connection lost: ${info.message}. Reload to reconnect.`));
 if(!await verifyABI(gpu.device))throw new Error('GPU particle layout check failed.');
 state.adapter=`${gpu.adapter} / WEBGPU`;
 const boss=await createBoss(gpu.device,gpu.shared);
 const physics=await createPhysics(gpu.device,gpu.shared);
 const combat=await createCombat(gpu.device,gpu.shared);
 gpu.shared.shotState=combat.shotState;
 const renderer=await createRenderer(gpu.device,gpu.context,gpu.format,gpu.shared,ui.canvas);
 const clock=new FixedClock(), metrics=new FrameMetrics();
 let map=DEFAULT_MAP, navigation=buildNavigation(map), spawnBaseline=DEFAULT_MAP.spawn;
 let epoch=run.epoch,count=0,spawnSlot=0, requestedPopulation=Math.min(50000,Math.max(1,Number(params.get('population'))||10000)), stepRequested=false;
 let wallTool=false;
 let builtWalls:Rect[]=[];
 let wireTool=false;
 let builtWires:(Rect & {health:number;maxHealth:number;breached:boolean})[]=[];
 let commands:Effect[]=[], visuals:Effect[]=[], visualParticles:VisualParticle[]=[], pointer:Vec2|undefined, lastTickSample=0, waveStartTick=0;
 let latest:Settlement={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
 let lastUI=0, previous=performance.now(), simulatedTime=0;
 const diagnostics=document.createElement('details');diagnostics.className='diagnostics';diagnostics.innerHTML='<summary>Developer diagnostics</summary><pre></pre>';root.append(diagnostics);
 const diagnosticText=diagnostics.querySelector('pre')!;
 const errors:string[]=[];
 let previousPaused=false;
 const AUTOSAVE_KEY='pressure-front.autosave.v1';let lastAutosave=0;
 const resizeSpawn=()=>{const scale=Math.sqrt(state.difficulty);const width=Math.min(70,spawnBaseline.width*scale),height=Math.min(96,spawnBaseline.height*scale);map={...map,spawn:{x:spawnBaseline.x,y:Math.max(2,Math.min(map.height-height-2,spawnBaseline.y+spawnBaseline.height/2-height/2)),width,height}};};
 const saveSession=()=>{if(state.mode!=='game'||run.model.phase!=='preparation')return;try{const runState=run.save();localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState,map,spawnBaseline,builtWalls,builtWires,difficulty:state.difficulty}));}catch{/* Local persistence is optional. */}};
 const restoreSession=()=>{try{const saved=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)??'null') as {runState?:string;map?:WorldMap;spawnBaseline?:Rect;builtWalls?:Rect[];builtWires?:(Rect & {health:number;maxHealth:number;breached:boolean})[];difficulty?:number}|null;if(!saved?.runState||!saved.map)return false;builtWalls=(saved.builtWalls??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y));builtWires=(saved.builtWires??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.health));const dynamic=[...builtWalls,...builtWires];const same=(a:Rect,b:Rect)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;map={...saved.map,obstacles:[...saved.map.obstacles.filter(obstacle=>!dynamic.some(segment=>same(obstacle,segment))),...builtWalls,...builtWires.filter(wire=>!wire.breached)]};spawnBaseline=saved.spawnBaseline??saved.map.spawn;state.difficulty=run.setSpawnMultiplier(saved.difficulty??1);resizeSpawn();navigation=buildNavigation(map);run.setMap(map);return run.load(saved.runState).ok;}catch{return false;}};
 const editor=createLevelEditor(root.querySelector<HTMLElement>('.view-actions')!,map,newMap=>{
   map=newMap;spawnBaseline=newMap.spawn;resizeSpawn();navigation=buildNavigation(map);run.setMap(map);state.mode='game';resetWorld();previousPaused=false;
   state.message='Custom level ready. Build your defense, then start a wave.';
 },active=>{if(active){previousPaused=state.paused;state.paused=true;state.selectedKind=null;stepRequested=false;state.message='Paint walls on the arena. Right-drag erases. Apply & Play starts a fresh defense.';}else{state.paused=previousPaused;}});

 const settlement=new SettlementReader(gpu.device,s=>{
   if(s.epoch!==epoch)return;
   latest=s;state.population=s.live;state.kills=s.kills;state.crushKills=s.crushKills;state.leaks=s.leaks;state.earned=s.earned;state.maxPressure=Math.max(state.maxPressure,s.maxPacking);
   if(state.mode==='game'){
     run.applySettlement(s);
     if(s.live===0&&count>0&&s.tick>=waveStartTick&&run.model.pending.length===0&&run.model.phase==='combat'){
       const result=run.finishSettling();if(result.ok){state.message=(run.model.phase as string)==='won'?'Containment held. All waves defeated.':'Wave cleared. Reinforce your defense.';count=0;}
     }
   }
 },error=>errors.push(String(error)));
 function resetWorld(resetRun=true){
   if(resetRun)run.reset();epoch=run.epoch;
   physics.reset();combat.reset();boss.reset(false);clock.reset();metrics.reset();lastTickSample=0;waveStartTick=0;simulatedTime=0;
   gpu.device.queue.writeBuffer(gpu.shared.counters,0,new Uint32Array(16));
   commands=[];visuals=[];visualParticles=[];count=0;spawnSlot=0;state.kills=state.crushKills=state.leaks=state.earned=state.maxPressure=0;state.selectedKind=null;state.selected=null;state.paused=false;
   latest={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
   if(state.mode==='lab'){
     const batches=requestedPopulation<=10000?[{count:Math.floor(requestedPopulation*.8),kind:'shambler' as const,seed:1},{count:Math.floor(requestedPopulation*.15),kind:'runner' as const,seed:2},{count:requestedPopulation-Math.floor(requestedPopulation*.8)-Math.floor(requestedPopulation*.15),kind:'brute' as const,seed:3}]:[{count:requestedPopulation,kind:'shambler' as const,seed:1}];
     const data=createParticles(batches,map,gpu.shared.capacity,spawnSlot);count=data.length/PARTICLE_FLOATS;spawnSlot+=count;gpu.device.queue.writeBuffer(gpu.shared.particles,0,data.buffer);
     state.message=count<requestedPopulation?`Spawn area fits ${count.toLocaleString()} of ${requestedPopulation.toLocaleString()} requested.`:'Click the crowd to detonate. Push it against a wall to crush it.';
   }else state.message='Build near the choke. Select a tower, then click a clear location.';
   state.population=count;previous=performance.now();
 }
 const actionResult=(result:{ok:boolean;reason?:string},success:string)=>{state.message=result.ok?success:result.reason||'Action unavailable.';};
 handleAction=action=>{
   if(failed)return;
   if(editor.active){state.message='Apply or cancel your level before using game controls.';return;}
   switch(action.type){
     case 'mode':state.mode=action.mode;resetWorld();break;
     case 'pause':state.paused=!state.paused;break;
     case 'step':state.paused=true;stepRequested=true;break;
     case 'reset':resetWorld();break;
     case 'heatmap':state.heatmap=action.value;break;
     case 'population':if(state.mode==='lab'){requestedPopulation=action.value;resetWorld();}break;
     case 'tool':state.tool=action.tool;state.selectedKind=null;break;
     case 'select-tower':wallTool=false;wireTool=false;state.selectedKind=state.selectedKind===action.kind?null:action.kind;state.message=state.selectedKind?`${TOWERS[state.selectedKind].name}: click a clear build location.`:'Click a tower to inspect it.';break;
     case 'wall-tool':wallTool=!wallTool;wireTool=false;state.selectedKind=null;state.message=wallTool?'Wall tool: click to place a 4 × 4 Metal wall. Routes and the boss lane stay protected.':'Wall tool cancelled.';break;
     case 'wire-tool':wireTool=!wireTool;wallTool=false;state.selectedKind=null;state.message=wireTool?'Barbed wire: restrains the swarm until high pressure forces a breach.':'Barbed wire tool cancelled.';break;
     case 'start-wave':{
       const result=run.startWave();actionResult(result,'Wave incoming. Hold the choke.');if(!result.ok)break;
       count=0;spawnSlot=0;state.population=0;physics.reset();combat.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;state.paused=false;state.selectedKind=null;break;
     }
     case 'upgrade':if(run.model.selected!==null)actionResult(run.upgrade(run.model.selected,action.branch),'Tower upgraded.');break;
     case 'buy-command':actionResult(run.buyCommandUpgrade(action.id),'Command upgrade installed.');break;
     case 'sell':if(run.model.selected!==null)actionResult(run.sell(run.model.selected),'Tower sold.');break;
     case 'difficulty':state.difficulty=run.setSpawnMultiplier(action.value);resizeSpawn();state.message=`Zombie production set to ${state.difficulty}×. Inlet expanded to protect spawn density.`;break;
     case 'bonus':actionResult(run.chooseBonus(action.id),'Bonus installed for this run.');break;
     case 'save':try{saveSession();state.message='Saved between waves on this browser.';}catch(error){state.message=String(error);}break;
     case 'load':{const result=run.load();if(result.ok){state.mode='game';resetWorld(false);}actionResult(result,'Saved defense restored.');break;}
   }
   updateUI(performance.now());
 };
 const wallAt=(point:Vec2):Rect=>({x:Math.floor(point.x/4)*4,y:Math.floor(point.y/4)*4,width:4,height:4});
 const burst=(point:Vec2, count:number, color:[number,number,number], speed:number, life:number, gravity=0)=>{
   // Keep the CPU-side flourish bounded: the swarm itself stays entirely GPU simulated.
   const available=Math.max(0,520-visualParticles.length);
   for(let i=0;i<Math.min(count,available);i++){
     const angle=(i/count)*Math.PI*2+Math.sin((simulatedTime+i)*9)*.32;
     const velocity=speed*(.45+((i*37)%100)/100*.7);
     visualParticles.push({x:point.x,y:point.y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,size:.13+((i*17)%100)/100*.28,life:life*(.65+((i*29)%100)/100*.45),age:0,color,gravity,drag:.32});
   }
 };
 const placeWall=(wall:Rect)=>{if(builtWalls.some(existing=>existing.x===wall.x&&existing.y===wall.y))return;const candidate={...map,obstacles:[...map.obstacles,wall]};const issue=validateEditorMap(candidate);if(issue){state.message=issue;return;}const result=run.spendMetal(60);if(!result.ok){state.message=result.reason??'Could not build wall.';return;}builtWalls.push(wall);map=candidate;navigation=buildNavigation(map);run.setMap(map);state.message='Metal wall installed. Right-drag removes for 30 Metal.';};
 const removeWall=(point:Vec2)=>{const index=builtWalls.findIndex(w=>point.x>=w.x&&point.x<w.x+w.width&&point.y>=w.y&&point.y<w.y+w.height);if(index<0)return;const [wall]=builtWalls.splice(index,1);map={...map,obstacles:map.obstacles.filter(existing=>existing!==wall)};navigation=buildNavigation(map);run.setMap(map);run.refundMetal(30);state.message='Metal wall recovered for 30 Metal.';};
 const placeWire=(wire:Rect)=>{if(builtWires.some(existing=>existing.x===wire.x&&existing.y===wire.y))return;const candidate={...map,obstacles:[...map.obstacles,wire]};const issue=validateEditorMap(candidate);if(issue){state.message=issue;return;}const result=run.spendMetal(45);if(!result.ok){state.message=result.reason??'Could not place wire.';return;}const stats=barbedWireStats(run.model.commandUpgrades),placed={...wire,health:stats.durability,maxHealth:stats.durability,breached:false};builtWires.push(placed);map=candidate;navigation=buildNavigation(map);run.setMap(map);state.message='Barbed wire installed. It restrains until swarm pressure forces a breach.';};
 const removeWire=(point:Vec2)=>{const index=builtWires.findIndex(w=>point.x>=w.x&&point.x<w.x+w.width&&point.y>=w.y&&point.y<w.y+w.height);if(index<0)return;const [wire]=builtWires.splice(index,1);map={...map,obstacles:map.obstacles.filter(existing=>existing!==wire)};navigation=buildNavigation(map);run.setMap(map);run.refundMetal(22);state.message='Barbed wire recovered for 22 Metal.';};
 ui.canvas.addEventListener('pointermove',event=>{pointer=renderer.screenToWorld(event.clientX,event.clientY);if(editor.active&&event.buttons)editor.paint(pointer,event.buttons&2?true:undefined);if((wallTool||wireTool)&&(event.buttons&2))(wallTool?removeWall:removeWire)(pointer);if(wallTool&&(event.buttons&1)){const wall=wallAt(pointer);if(!builtWalls.some(w=>w.x===wall.x&&w.y===wall.y))placeWall(wall);}if(wireTool&&(event.buttons&1)){const wire=wallAt(pointer);if(!builtWires.some(w=>w.x===wire.x&&w.y===wire.y))placeWire(wire);}});
 ui.canvas.addEventListener('wheel',event=>{if(editor.active)return;event.preventDefault();renderer.zoomAt(event.deltaY<0?1.13:1/1.13,event.clientX,event.clientY);},{passive:false});
 ui.canvas.addEventListener('contextmenu',event=>{if(editor.active||wallTool||wireTool)event.preventDefault();});
 ui.canvas.addEventListener('pointerleave',()=>{pointer=undefined;});
 ui.canvas.addEventListener('pointerdown',event=>{
   if(failed)return;const point=renderer.screenToWorld(event.clientX,event.clientY);
   if(editor.active){editor.paint(point,event.button===2?true:undefined);return;}
   if(state.mode==='game'){
     if(wallTool){if(event.button===2)removeWall(point);else placeWall(wallAt(point));return;}
     if(wireTool){if(event.button===2)removeWire(point);else placeWire(wallAt(point));return;}
     if(state.selectedKind){const result=run.place(state.selectedKind,point);actionResult(result,result.tower?`${TOWERS[result.tower.kind].name} deployed.`:'Tower deployed.');}
     else{run.model.selected=run.model.towers.find(t=>Math.hypot(t.x-point.x,t.y-point.y)<3.5)?.id??null;}
   }else if(state.tool!=='inspect'){
     if(commands.length>=64){state.message='Effect queue full; advance the simulation.';return;}
     const effect:Effect={...point,kind:state.tool==='blast'?'blast':'push',radius:state.tool==='blast'?10:15,strength:state.tool==='blast'?32:38,damage:state.tool==='blast'?16:0,direction:{x:1,y:0},cone:Math.PI*.7,duration:.55,source:0};commands.push(effect);visuals.push({...effect});
     if(effect.kind==='blast'){burst(point,42,[1,.34,.06],18,.62,9);burst(point,18,[1,.82,.25],10,.38,3);}else burst(point,20,[.35,.9,1],13,.48,0);
     state.message=state.tool==='blast'?'Concussive blast deployed.':'Pressure pulse deployed toward the base.';
   }else state.message=`World position ${point.x.toFixed(1)}, ${point.y.toFixed(1)} · peak packing ${latest.maxPacking.toFixed(2)}`;
 });
 const panKeys=new Set<string>();
 window.addEventListener('keydown',event=>{if((event.target as HTMLElement).matches('input,textarea,select'))return;const key=event.key.toLowerCase();if(['w','a','s','d'].includes(key)){event.preventDefault();panKeys.add(key);return;}const towerIndex=Number(key)-1;if(Number.isInteger(towerIndex)&&towerIndex>=0&&towerIndex<Object.keys(TOWERS).length){event.preventDefault();handleAction({type:'select-tower',kind:Object.keys(TOWERS)[towerIndex] as keyof typeof TOWERS});return;}if(key==='q'){event.preventDefault();handleAction({type:'wall-tool'});return;}if(key==='e'){event.preventDefault();handleAction({type:'wire-tool'});return;}if(event.code==='Space'){event.preventDefault();handleAction(state.mode==='game'&&run.model.phase==='preparation'?{type:'start-wave'}:{type:'pause'});}if(event.key==='Escape'){state.selectedKind=null;run.model.selected=null;}if(key==='h')handleAction({type:'heatmap',value:!state.heatmap});if(key==='+'||key==='=')renderer.zoomAt(1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);if(key==='-')renderer.zoomAt(1/1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);});
 window.addEventListener('keyup',event=>panKeys.delete(event.key.toLowerCase()));
 function updateUI(now:number){
   const report=metrics.report();state.fps=report.fps;state.frameMs=report.medianMs;
   state.metal=run.model.metal;state.baseHealth=run.model.baseHealth/20*100;state.wave=run.model.wave;state.waveCount=run.model.waveCount;state.phase=state.mode==='lab'?'combat':run.model.phase;
   state.selected=run.model.towers.find(t=>t.id===run.model.selected)??null;state.bonusChoices=state.mode==='game'?run.model.bonusChoices:[];
   state.bossHealth=latest.boss?.active?latest.boss.health/latest.boss.maxHealth*100:undefined;state.commandUpgrades=state.mode==='game'?run.model.commandUpgrades:[];
   ui.update(state);if(now-lastAutosave>1500){saveSession();lastAutosave=now;}lastUI=now;
   diagnosticText.textContent=JSON.stringify({adapter:gpu.adapter,abi:'passed',epoch,tick:clock.tick,simulationSeconds:simulatedTime,slots:count,live:latest.live,requested:requestedPopulation,invalid:latest.invalid,peakPacking:latest.maxPacking,crushKills:latest.crushKills,kills:latest.kills,medianMs:report.medianMs,p95Ms:report.p95Ms,frameSamples:report.samples,canvas:[ui.canvas.width,ui.canvas.height],readbackErrors:errors,boss:latest.boss},null,2);
 }
 function tick(){
   clock.tick++;simulatedTime+=clock.step;
   if(state.mode==='game')run.accrueVeterancy(clock.step);
   if(state.mode==='game'&&run.model.phase==='combat'){
     const batches=run.takeSpawns(gpu.shared.capacity-count,clock.step);
     if(batches.length){const data=createParticles(batches,map,gpu.shared.capacity-count,spawnSlot);const added=data.length/PARTICLE_FLOATS;spawnSlot+=added;gpu.device.queue.writeBuffer(gpu.shared.particles,count*PARTICLE_FLOATS*4,data.buffer);count+=added;state.population+=added;}
   }
   const wireStats=barbedWireStats(run.model.commandUpgrades);
   const effects=[...commands,...builtWires.map(wire=>({x:wire.x+wire.width/2,y:wire.y+wire.height/2,kind:'slow' as const,radius:3.2,strength:0,damage:wireStats.damage*clock.step,direction:{x:0,y:0},cone:0,duration:wireStats.slow,source:0}))].slice(0,64);commands=[];
   if(state.mode==='game'&&run.model.phase==='combat'&&builtWires.length){const contact=Math.min(1,latest.live/30),erosion=clock.step*wireStats.damage*contact*(1+Math.max(0,latest.maxPacking-1)*.4);const breached=builtWires.filter(wire=>!wire.breached&&latest.maxPacking>=wireStats.resistance);for(const wire of breached){wire.breached=true;map={...map,obstacles:map.obstacles.filter(obstacle=>obstacle!==wire)};burst({x:wire.x+wire.width/2,y:wire.y+wire.height/2},32,[1,.32,.08],13,.72,11);burst({x:wire.x+wire.width/2,y:wire.y+wire.height/2},16,[.5,.6,.62],8,.95,8);}if(breached.length){navigation=buildNavigation(map);run.setMap(map);state.message=`${breached.length} barbed wire section${breached.length===1?'':'s'} gave way under swarm pressure.`;}const spent=builtWires.filter(wire=>(wire.health-=erosion)<=0);if(spent.length){for(const wire of spent)burst({x:wire.x+wire.width/2,y:wire.y+wire.height/2},18,[.56,.42,.22],7,.8,8);builtWires=builtWires.filter(wire=>wire.health>0);map={...map,obstacles:map.obstacles.filter(obstacle=>!spent.includes(obstacle as typeof spent[number]))};navigation=buildNavigation(map);run.setMap(map);state.message=`${spent.length} barbed wire section${spent.length===1?'':'s'} wore out after cutting through the swarm.`;}}
   const frame:CombatFrame={dt:clock.step,tick:clock.tick,count,map,effects,tuning:DEFAULT_TUNING,navigation,lab:state.mode==='lab',towers:state.mode==='game'?run.model.towers.map(tower=>({tower,definition:compileTower(tower,run.model.bonuses,run.model.commandUpgrades)})):[]};
   const encoder=gpu.device.createCommandEncoder({label:`Simulation tick ${clock.tick}`});
   const bossFrame={dt:clock.step,tick:clock.tick,count,map:{...map,spawn:{x:50,y:35,width:32,height:30}},active:state.mode==='game'&&run.isBossWave};
   combat.encodeBefore(encoder,frame);boss.encode(encoder,bossFrame);physics.encode(encoder,frame);combat.encodeAfter(encoder,frame);boss.encodeResolve(encoder,bossFrame);
   let finish:(()=>void)|undefined;
   if(clock.tick-lastTickSample>=6||stepRequested){finish=settlement.encode(encoder,gpu.shared.counters,epoch,clock.tick);if(finish)lastTickSample=clock.tick;}
   gpu.device.queue.submit([encoder.finish()]);finish?.();
 }
 function frame(now:number){
   if(failed)return;
   try{
     const elapsed=(now-previous)/1000;previous=now;metrics.push(elapsed*1000);
     const active=state.mode==='lab'||run.model.phase==='combat'||run.model.phase==='settling';
     if(!editor.active&&panKeys.size){const speed=52*elapsed;renderer.pan((panKeys.has('d')?speed:0)-(panKeys.has('a')?speed:0),(panKeys.has('s')?speed:0)-(panKeys.has('w')?speed:0));}
     const steps=editor.active?0:stepRequested?1:clock.advance(elapsed,state.paused||!active);
     for(let i=0;i<steps;i++)tick();stepRequested=false;
     if(!state.paused){for(const effect of visuals)effect.duration-=elapsed;visuals=visuals.filter(e=>e.duration>0);for(const particle of visualParticles)particle.age+=elapsed;visualParticles=visualParticles.filter(particle=>particle.age<particle.life);}
     const encoder=gpu.device.createCommandEncoder({label:'Present'});
     const ghost=state.mode==='game'&&state.selectedKind&&pointer?{...pointer,kind:state.selectedKind,range:compileTower({id:0,kind:state.selectedKind,x:pointer.x,y:pointer.y,level:0,branch:-1,angle:0,cooldown:0,spent:0},run.model.bonuses,run.model.commandUpgrades).range,valid:canPlace(map,run.model.towers,pointer,1.25)&&run.model.phase!=='won'&&run.model.phase!=='lost'}:undefined;
     const wallGhost=state.mode==='game'&&wallTool&&pointer?{...wallAt(pointer),valid:!validateEditorMap({...map,obstacles:[...map.obstacles,wallAt(pointer)]})}:undefined;
     renderer.encode(encoder,{count:editor.active?0:count,time:simulatedTime,map:editor.active?editor.map:map,towers:!editor.active&&state.mode==='game'?run.model.towers:[],effects:editor.active?[]:visuals,visualParticles:editor.active?[]:visualParticles,wires:editor.active?[]:builtWires,heatmap:state.heatmap,selection:run.model.selected,ghost:editor.active?undefined:ghost,wallGhost,boss:!editor.active&&latest.boss?.active?latest.boss:undefined});
     gpu.device.queue.submit([encoder.finish()]);
     if(now-lastUI>100)updateUI(now);
     requestAnimationFrame(frame);
   }catch(error){fail(error);}
 }
 const restored=restoreSession();resetWorld(!restored);updateUI(performance.now());requestAnimationFrame(frame);
} catch(error){state.message=String(error);state.paused=true;ui.update(state);console.error(error);}

}

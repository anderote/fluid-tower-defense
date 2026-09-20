import {createStructurePreview, clearPlayerTerrain, structurePlacementIssue} from '../game/terrain.ts';
import {AUTOSAVE_KEY, CHECKPOINT_KEY, saveDefense, loadDefense} from '../persistence/defense.ts';
import { connectGPU } from '../runtime/gpu.ts';
import { verifyABI } from '../runtime/abi-check.ts';
import { FixedClock } from '../runtime/clock.ts';
import { FrameMetrics } from '../runtime/metrics.ts';
import { SettlementReader } from '../runtime/readback.ts';
import { createLevelEditor, validateEditorMap, wallAtPoint } from '../editor/index.ts';
import '../editor/style.css';
import { createUI } from '../ui/index.ts';
import { createRenderer } from '../render/index.ts';
import {createAudio} from '../audio/index.ts';
import {createBoss} from '../sim/bosses/index.ts';
import { createPhysics } from '../sim/physics/index.ts';
import { createCombat, type CombatFrame } from '../sim/combat/index.ts';
import { barbedWireStats, createParticles, DEFAULT_MAP, compileTower, TOWERS } from '../content/index.ts';
import { buildNavigation, canPlace, snapToMount } from '../navigation/index.ts';
import {wallCapacity, wallHealthAfterPressure} from '../sim/walls/model.ts';
import { createCommandProgression, createRun, STARTING_METAL } from '../game/index.ts';
import { COUNTER_WORDS, DEFAULT_TUNING, PARTICLE_FLOATS, type UIState, type GameAction, type Effect, type Vec2, type Rect, type Settlement, type VisualParticle, type VisualParticleStyle, type WorldMap } from '../contracts/index.ts';
import {ShotEventReader} from '../runtime/shot-events.ts';

const root=document.querySelector<HTMLElement>('#app')!;
const params=new URLSearchParams(location.search);
if(params.has('validate')) {
 const {showValidation}=await import('./validation-page.ts');await showValidation(root);
} else {
const run=createRun();
const progression=createCommandProgression();
const state:UIState={mode:params.get('mode')==='lab'?'lab':'game',phase:'preparation',paused:false,fps:0,frameMs:0,population:10000,capacity:65536,kills:0,crushKills:0,leaks:0,earned:0,maxPressure:0,metal:650,baseHealth:100,level:1,wave:0,waveCount:10,difficulty:1,selected:null,selectedKind:null,buildTool:null,heatmap:true,tool:'blast',message:'Connecting to local GPU…',adapter:'WebGPU',bonusChoices:[],commandUpgrades:[],commandXp:progression.xp,metaUpgrades:progression.upgrades(),towerUnlocks:progression.towerUnlocks(),extractionXp:0};
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
 const audio=createAudio();
 const selectedInspector=ui.canvas.parentElement!.querySelector<HTMLElement>('.selected-popup')!;
 const clock=new FixedClock(), metrics=new FrameMetrics();
 let map=DEFAULT_MAP, navigation=buildNavigation(map), spawnBaseline=DEFAULT_MAP.spawn;
 let epoch=run.epoch,count=0,spawnSlot=0, requestedPopulation=Math.min(50000,Math.max(1,Number(params.get('population'))||10000));
 let wallTool=false;
 let builtWalls:(Rect & {health:number;maxHealth:number})[]=[];
 let wireTool=false;
/* Recycle hover branch variant is superseded here by the placement-preview wall model. */
 let builtWires:(Rect & {health:number;maxHealth:number;breached:boolean})[]=[];
 let commands:Effect[]=[], visuals:Effect[]=[], visualParticles:VisualParticle[]=[], pointer:Vec2|undefined, lastTickSample=0, waveStartTick=0;
 let latest:Settlement={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
 let lastUI=0, previous=performance.now(), simulatedTime=0;
 const diagnostics=document.createElement('details');diagnostics.className='diagnostics';diagnostics.innerHTML='<summary>Developer diagnostics</summary><pre></pre>';root.append(diagnostics);
 const diagnosticText=diagnostics.querySelector('pre')!;
 const errors:string[]=[];
 let previousPaused=false;
 const AUTOSAVE_KEY='pressure-front.autosave.v1';let lastAutosave=0;
 const resizeSpawn=()=>{map={...map,spawn:{...spawnBaseline}};};
 const saveSession=()=>{if(state.mode!=='game'||!['preparation','checkpoint'].includes(run.model.phase))return;try{const runState=run.save();localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState,map,spawnBaseline,builtWalls,builtWires,difficulty:state.difficulty}));}catch{/* Local persistence is optional. */}};
 const restoreSession=()=>{try{const saved=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)??'null') as {runState?:string;map?:WorldMap;spawnBaseline?:Rect;builtWalls?:(Rect & Partial<{health:number;maxHealth:number}>)[];builtWires?:(Rect & {health:number;maxHealth:number;breached:boolean})[];difficulty?:number}|null;if(!saved?.runState||!saved.map)return false;builtWalls=(saved.builtWalls??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y)).map(w=>{const maxHealth=typeof w.maxHealth==='number'&&Number.isFinite(w.maxHealth)?w.maxHealth:wallCapacity(0),health=typeof w.health==='number'&&Number.isFinite(w.health)?w.health:maxHealth;return {...w,health,maxHealth};});builtWires=(saved.builtWires??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.health));const dynamic=[...builtWalls,...builtWires];const same=(a:Rect,b:Rect)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;map={...saved.map,obstacles:[...saved.map.obstacles.filter(obstacle=>!dynamic.some(segment=>same(obstacle,segment))),...builtWalls,...builtWires.filter(wire=>!wire.breached)]};spawnBaseline=saved.spawnBaseline??saved.map.spawn;state.difficulty=run.setSpawnMultiplier(saved.difficulty??1);resizeSpawn();navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts(builtWalls);return run.load(saved.runState).ok;}catch{return false;}};
 const editor=createLevelEditor(root.querySelector<HTMLElement>('.view-actions')!,map,newMap=>{
   map=newMap;spawnBaseline=newMap.spawn;builtWalls=[];builtWires=[];resizeSpawn();navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts(builtWalls);state.mode='game';resetWorld();previousPaused=false;
   state.message='Custom level ready. Build your defense, then start a wave.';
 },active=>{if(active){previousPaused=state.paused;state.paused=true;state.selectedKind=null;state.buildTool=null;state.message='Paint walls on the arena. Right-drag erases. Apply & Play starts a fresh defense.';}else{state.paused=previousPaused;}});
 const newGame=()=>{try{localStorage.removeItem(AUTOSAVE_KEY);localStorage.removeItem('pressure-front.customlevel.v1');}catch{/* Persistence is optional. */}run.clearSave();progression.reset();editor.resetToDefault();state.mode='game';state.difficulty=1;map=DEFAULT_MAP;spawnBaseline=DEFAULT_MAP.spawn;builtWalls=[];builtWires=[];navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts([]);resetWorld();state.message='New game started.';};

 const settlement=new SettlementReader(gpu.device,s=>{
   if(s.epoch!==epoch)return;
   latest=s;state.population=s.live;state.kills=s.kills;state.crushKills=s.crushKills;state.leaks=s.leaks;state.earned=s.earned;state.maxPressure=Math.max(state.maxPressure,s.maxPressure??0);
   if(state.mode==='game'){
     run.applySettlement(s);
     if(s.live===0&&count>0&&s.tick>=waveStartTick&&run.model.pending.length===0&&run.model.phase==='combat'){
       const clearedWave=run.model.wave,result=run.finishSettling();if(result.ok){const xp=18+run.model.level*8+clearedWave*3,checkpoint=clearedWave>=10;progression.award(xp);state.message=checkpoint?`Wave ${clearedWave} contained. Extract for ${run.extractionXp} XP or keep this defense and continue.`:run.model.bonusChoices.length?'Wave cleared. Choose a command boon.':`Wave cleared. +${xp} Command XP.`;count=0;}
     }
   }
 },error=>errors.push(String(error)));
 function resetWorld(resetRun=true){
   if(resetRun){
     map=clearPlayerTerrain(map,builtWalls,builtWires);builtWalls=[];builtWires=[];
     navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts([]);run.reset();
   }
   epoch=run.epoch;
   physics.reset();combat.reset();shotReader.reset();boss.reset(false);clock.reset();metrics.reset();lastTickSample=0;waveStartTick=0;simulatedTime=0;
   gpu.device.queue.writeBuffer(gpu.shared.counters,0,new Uint32Array(COUNTER_WORDS));
   commands=[];visuals=[];visualParticles=[];count=0;spawnSlot=0;state.kills=state.crushKills=state.leaks=state.earned=state.maxPressure=0;state.selectedKind=null;state.selected=null;state.buildTool=null;state.paused=false;
   latest={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
   if(state.mode==='lab'){
     const batches=requestedPopulation<=10000?[{count:Math.floor(requestedPopulation*.8),kind:'shambler' as const,seed:1},{count:Math.floor(requestedPopulation*.15),kind:'runner' as const,seed:2},{count:requestedPopulation-Math.floor(requestedPopulation*.8)-Math.floor(requestedPopulation*.15),kind:'brute' as const,seed:3}]:[{count:requestedPopulation,kind:'shambler' as const,seed:1}];
     const data=createParticles(batches,map,gpu.shared.capacity,spawnSlot);count=data.length/PARTICLE_FLOATS;spawnSlot+=count;gpu.device.queue.writeBuffer(gpu.shared.particles,0,data.buffer);
     state.message=count<requestedPopulation?`Spawn area fits ${count.toLocaleString()} of ${requestedPopulation.toLocaleString()} requested.`:'Click the crowd to detonate. Push it against a wall to crush it.';
   }else state.message='Build near the choke. Select a tower, then click a clear location.';
   state.population=count;previous=performance.now();
 }
 const sameRect=(left:Rect,right:Rect)=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;
 const removeStructuresFromMap=(structures:readonly Rect[])=>{map={...map,obstacles:map.obstacles.filter(obstacle=>!structures.some(structure=>sameRect(obstacle,structure)))};navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts(builtWalls);};
 const clearPlayerStructures=()=>{removeStructuresFromMap([...builtWalls,...builtWires]);builtWalls=[];builtWires=[];run.setBuildMounts([]);};
 const actionResult=(result:{ok:boolean;reason?:string},success:string)=>{state.message=result.ok?success:result.reason||'Action unavailable.';};
 handleAction=action=>{
   if(failed)return;
   if(editor.active){state.message='Apply or cancel your level before using game controls.';return;}
   switch(action.type){
     case 'mode':state.mode=action.mode;resetWorld();break;
     case 'pause':state.paused=!state.paused;break;
     case 'reset':clearPlayerStructures();resetWorld();state.message='Run reset. Placed walls and wire were removed.';break;
     case 'restart-wave':{
       const result=run.restartWave();actionResult(result,'Wave restarted. Defenses remain in position.');if(!result.ok)break;
       epoch=run.epoch;count=0;spawnSlot=0;commands=[];visuals=[];visualParticles=[];state.population=0;state.kills=state.crushKills=state.leaks=state.earned=state.maxPressure=0;
       latest={epoch,tick:clock.tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
       gpu.device.queue.writeBuffer(gpu.shared.counters,0,new Uint32Array(COUNTER_WORDS));physics.reset();combat.reset();shotReader.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;lastTickSample=clock.tick;state.paused=false;state.selectedKind=null;
       break;
     }
     case 'new-game':newGame();break;
     case 'heatmap':state.heatmap=action.value;break;
     case 'population':if(state.mode==='lab'){requestedPopulation=action.value;resetWorld();}break;
     case 'tool':state.tool=action.tool;state.selectedKind=null;break;
     case 'select-tower':if(action.kind&&!progression.isTowerUnlocked(action.kind)){state.selectedKind=null;state.message=`${TOWERS[action.kind].name} is locked. Research it with Command XP first.`;break;}wallTool=false;wireTool=false;state.buildTool=null;run.model.selected=null;state.selectedKind=state.selectedKind===action.kind?null:action.kind;state.message=state.selectedKind?`${TOWERS[state.selectedKind].name}: click a clear build location.`:'Click a tower to inspect it.';break;
     case 'unlock-tower':{const result=progression.unlockTower(action.kind);actionResult(result,`${TOWERS[action.kind].name} unlocked permanently.`);state.selectedKind=null;break;}
     case 'wall-tool':wallTool=!wallTool;wireTool=false;state.buildTool=wallTool?'wall':null;state.selectedKind=null;state.message=wallTool?'Wall tool: click to place a 4 × 4 Metal wall, or reinforce a damaged wall to full integrity.':'Wall tool cancelled.';break;
     case 'wire-tool':wireTool=!wireTool;wallTool=false;state.buildTool=wireTool?'wire':null;state.selectedKind=null;state.message=wireTool?'Barbed wire: restrains the swarm until high pressure forces a breach.':'Barbed wire tool cancelled.';break;
     case 'demolish-tool':wallTool=false;wireTool=false;state.buildTool=state.buildTool==='demolish'?null:'demolish';state.selectedKind=null;state.message=state.buildTool==='demolish'?'Demolish tool: click a player-built wall or barbed wire to recover half its Metal.':'Demolish tool cancelled.';break;
     case 'start-wave':{
       const result=run.startWave();actionResult(result,'Wave incoming. Hold the choke.');if(!result.ok)break;
       count=0;spawnSlot=0;state.population=0;physics.reset();combat.reset();shotReader.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;state.paused=false;state.selectedKind=null;break;
     }
     case 'continue-run':{const result=run.continueRun();if(result.ok){const unlocked=progression.unlockForLevel(run.model.level);state.message=unlocked?`Command tier ${progression.unlockedTier} unlocked. Wave ${run.model.wave+1} is ready.`:`Defense retained. Wave ${run.model.wave+1} is ready.`;}else state.message=result.reason;break;}
     case 'finish-run':{const result=run.finishRun();if(result.ok){progression.award(result.xp??0);state.message=`Sector secured after ${run.model.wave} waves. +${result.xp??0} extraction XP.`;}else state.message=result.reason;break;}
     case 'upgrade':if(run.model.selected!==null)actionResult(run.upgrade(run.model.selected,action.branch),'Tower upgraded.');break;
     case 'buy-command':actionResult(run.buyCommandUpgrade(action.id),'Command upgrade installed.');break;
     case 'buy-meta':actionResult(progression.buy(action.id),'Permanent Command upgrade installed.');break;
     case 'sell':if(run.model.selected!==null){const result=run.sell(run.model.selected);if(result.ok){combat.resetAttribution();run.resetTowerAttribution();}actionResult(result,'Tower sold.');}break;
     case 'difficulty':state.difficulty=run.setSpawnMultiplier(action.value);resizeSpawn();state.message=`Zombie production set to ${state.difficulty}×. The inlet stays fixed; stream rate increases.`;break;
     case 'bonus':actionResult(run.chooseBonus(action.id),'Bonus installed for this run.');break;
   }
   updateUI(performance.now());
 };
 const previewStructure=createStructurePreview();
 const wallAt=(point:Vec2):Rect=>wallAtPoint(map,point);
 const towerPlacement=(point:Vec2):Vec2=>snapToMount(point,builtWalls);
 const burst=(point:Vec2, count:number, color:[number,number,number], speed:number, life:number, gravity=0, style:VisualParticleStyle='spark', scale=1)=>{
   // Keep the CPU-side flourish bounded: the swarm itself stays entirely GPU simulated.
   const available=Math.max(0,520-visualParticles.length);
   for(let i=0;i<Math.min(count,available);i++){
     const angle=(i/count)*Math.PI*2+Math.sin((simulatedTime+i)*9)*.32;
     const velocity=speed*(.45+((i*37)%100)/100*.7);
     visualParticles.push({x:point.x,y:point.y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,size:(.2+((i*17)%100)/100*.38)*scale,life:life*(.65+((i*29)%100)/100*.45),age:0,color,gravity,drag:style==='smoke'?.55:.32,style,spin:(i%2?1:-1)*(2.4+((i*13)%10)*.35)});
   }
 };
 const shotReader=new ShotEventReader(gpu.device,events=>{
   for(const event of events){
     const tower=run.model.towers.find(candidate=>candidate.id===event.towerId);if(!tower)continue;
     audio.fire(tower.kind,tower.x,event.serial);
     if(tower.kind!=='autocannon'&&tower.kind!=='railgun')continue;
     const forward={x:Math.cos(event.angle),y:Math.sin(event.angle)},side={x:-forward.y,y:forward.x};
     const flip=event.serial%2?1:-1,speed=tower.kind==='railgun'?7.2:5.4,heavy=tower.kind==='railgun';
     if(visualParticles.length<520)visualParticles.push({x:tower.x+forward.x*1.25+side.x*.35*flip,y:tower.y+forward.y*1.25+side.y*.35*flip,vx:side.x*speed*flip-forward.x*1.4,vy:side.y*speed*flip-forward.y*1.4,size:heavy ? .42 : .3,life:heavy ? .92 : .72,age:0,color:heavy?[.78,.57,.24]:[.9,.7,.27],gravity:7.5,drag:.42,style:'shell',spin:(flip*(heavy?12:18))});
     audio.shell(tower.x,event.serial,heavy);
     burst(event.target,heavy?10:6,heavy?[.46,1,.82]:[1,.7,.18],heavy?10:7,heavy ? .32 : .22,2,'spark',heavy?1.2:.8);
     burst({x:tower.x+forward.x*1.9,y:tower.y+forward.y*1.9},2,[.24,.22,.18],2.2,.52,-.7,'smoke',heavy?1.15:.8);
   }
 },error=>errors.push(`shot readback: ${String(error)}`));
 const placeWall=(wall:Rect)=>{const existing=builtWalls.find(candidate=>candidate.x===wall.x&&candidate.y===wall.y);if(existing){if(existing.health>=existing.maxHealth){state.message='Metal wall is already at full integrity.';return;}const result=run.spendMetal(60);if(!result.ok){state.message=result.reason??'Could not reinforce wall.';return;}existing.health=existing.maxHealth;state.message='Metal wall reinforced to full integrity.';return;}const candidate={...map,obstacles:[...map.obstacles,wall]};const issue=validateEditorMap(candidate);if(issue){state.message=issue;return;}const result=run.spendMetal(60);if(!result.ok){state.message=result.reason??'Could not build wall.';return;}const capacity=wallCapacity(0);builtWalls.push({...wall,health:capacity,maxHealth:capacity});map=candidate;navigation=buildNavigation(map);run.setMap(map);run.setBuildMounts(builtWalls);state.message='Metal wall installed. Turrets snap to its center.';};
 const placeWire=(wire:Rect)=>{if(builtWires.some(existing=>existing.x===wire.x&&existing.y===wire.y))return;const candidate={...map,obstacles:[...map.obstacles,wire]};const issue=validateEditorMap(candidate);if(issue){state.message=issue;return;}const result=run.spendMetal(45);if(!result.ok){state.message=result.reason??'Could not place wire.';return;}const stats=barbedWireStats(run.model.commandUpgrades),placed={...wire,health:stats.durability,maxHealth:stats.durability,breached:false};builtWires.push(placed);map=candidate;navigation=buildNavigation(map);run.setMap(map);state.message='Barbed wire installed. It restrains until swarm pressure forces a breach.';};
 const demolishAt=(point:Vec2)=>{const wall=builtWalls.find(candidate=>point.x>=candidate.x&&point.x<candidate.x+candidate.width&&point.y>=candidate.y&&point.y<candidate.y+candidate.height);if(wall){removeWall(point);return;}const wire=builtWires.find(candidate=>point.x>=candidate.x&&point.x<candidate.x+candidate.width&&point.y>=candidate.y&&point.y<candidate.y+candidate.height);if(wire){removeWire(point);return;}state.message='Only player-built Metal Walls and Barbed Wire can be demolished.';};
 ui.canvas.addEventListener('pointermove',event=>{pointer=renderer.screenToWorld(event.clientX,event.clientY);if(editor.active&&event.buttons)editor.paint(pointer,event.buttons&2?true:undefined);if((wallTool||wireTool)&&(event.buttons&2))(wallTool?removeWall:removeWire)(pointer);if(wallTool&&(event.buttons&1))placeWall(wallAt(pointer));if(wireTool&&(event.buttons&1)){const wire=wallAt(pointer);if(!builtWires.some(w=>w.x===wire.x&&w.y===wire.y))placeWire(wire);}});
 const removeWall=(point:Vec2)=>{const index=builtWalls.findIndex(w=>point.x>=w.x&&point.x<w.x+w.width&&point.y>=w.y&&point.y<w.y+w.height);if(index<0)return;const wall=builtWalls[index],center={x:wall.x+wall.width/2,y:wall.y+wall.height/2};if(run.model.towers.some(tower=>Math.hypot(tower.x-center.x,tower.y-center.y)<.01)){state.message='Sell the mounted turret before removing this wall.';return;}builtWalls.splice(index,1);removeStructuresFromMap([wall]);run.refundMetal(30);state.message='Metal wall recovered for 30 Metal.';};
 const removeWire=(point:Vec2)=>{const index=builtWires.findIndex(w=>point.x>=w.x&&point.x<w.x+w.width&&point.y>=w.y&&point.y<w.y+w.height);if(index<0)return;const [wire]=builtWires.splice(index,1);removeStructuresFromMap([wire]);run.refundMetal(22);state.message='Barbed wire recovered for 22 Metal.';};
 ui.canvas.addEventListener('wheel',event=>{if(editor.active)return;event.preventDefault();renderer.zoomAt(event.deltaY<0?1.13:1/1.13,event.clientX,event.clientY);},{passive:false});
 ui.canvas.addEventListener('contextmenu',event=>{if(editor.active||state.buildTool)event.preventDefault();});
 ui.canvas.addEventListener('pointerleave',()=>{pointer=undefined;});
 ui.canvas.addEventListener('pointerdown',event=>{
   audio.arm();if(failed)return;const point=renderer.screenToWorld(event.clientX,event.clientY);
   if(editor.active){editor.paint(point,event.button===2?true:undefined);return;}
   if(state.mode==='game'){
     if(state.buildTool==='wall'){if(event.button===2)removeWall(point);else placeWall(wallAt(point));return;}
     if(state.buildTool==='wire'){if(event.button===2)removeWire(point);else placeWire(wallAt(point));return;}
     if(state.buildTool==='demolish'){demolishAt(point);return;}
     if(state.selectedKind){const result=run.place(state.selectedKind,towerPlacement(point));if(result.ok){combat.resetAttribution();run.resetTowerAttribution();}actionResult(result,result.tower?`${TOWERS[result.tower.kind].name} deployed.`:'Tower deployed.');}
     else{run.model.selected=run.model.towers.find(t=>Math.hypot(t.x-point.x,t.y-point.y)<3.5)?.id??null;}
   }else if(state.tool!=='inspect'){
     if(commands.length>=64){state.message='Effect queue full; advance the simulation.';return;}
     const effect:Effect={...point,kind:state.tool==='blast'?'blast':'push',radius:state.tool==='blast'?10:15,strength:state.tool==='blast'?32:38,damage:state.tool==='blast'?16:0,direction:{x:1,y:0},cone:Math.PI*.7,duration:.55,source:0};commands.push(effect);visuals.push({...effect});
     if(effect.kind==='blast'){
       burst(point,34,[1,.3,.035],21,.68,8,'spark',1.25);
       burst(point,16,[1,.78,.16],11,.48,4,'spark',.8);
       burst(point,11,[.24,.2,.15],5.5,1.35,-2.8,'smoke',2.8);
     }else{
       burst(point,24,[.35,.92,1],14,.58,0,'spark',1.05);
       burst(point,10,[.16,.65,.82],5,.85,-1.2,'mist',2.2);
     }
     state.message=state.tool==='blast'?'Concussive blast deployed.':'Pressure pulse deployed toward the base.';
   }else state.message=`World position ${point.x.toFixed(1)}, ${point.y.toFixed(1)} · peak packing ${latest.maxPacking.toFixed(2)}`;
 });
 const panKeys=new Set<string>();
 window.addEventListener('keydown',event=>{
   audio.arm();
   if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
   const target=event.target;
   if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select')))return;
   if(event.code==='Space'&&target instanceof HTMLElement&&target.closest('button,a[href],[role=button]'))return;
   const key=event.key.toLowerCase();
   if(['w','a','s','d'].includes(key)){event.preventDefault();panKeys.add(key);return;}
   if(event.repeat&&[' ','q','e','r','h','escape','1','2','3','4','5','6','7','8'].includes(key)){event.preventDefault();return;}
   const towerIndex=Number(key)-1;
   if(Number.isInteger(towerIndex)&&towerIndex>=0&&towerIndex<Object.keys(TOWERS).length){
     event.preventDefault();handleAction({type:'select-tower',kind:Object.keys(TOWERS)[towerIndex] as keyof typeof TOWERS});return;
   }
   if(key==='q'){event.preventDefault();handleAction({type:'wall-tool'});return;}
   if(key==='e'){event.preventDefault();handleAction({type:'wire-tool'});return;}
   if(key==='r'){event.preventDefault();handleAction({type:'demolish-tool'});return;}
   if(event.code==='Space'){
     event.preventDefault();handleAction(state.mode==='game'&&run.model.phase==='preparation'?{type:'start-wave'}:{type:'pause'});
   }
   if(event.key==='Escape'){
     event.preventDefault();state.selectedKind=null;state.buildTool=null;run.model.selected=null;state.message='Placement cancelled.';
   }
   if(key==='h')handleAction({type:'heatmap',value:!state.heatmap});
   if(key==='+'||key==='=')renderer.zoomAt(1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);
   if(key==='-')renderer.zoomAt(1/1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);
 });
 window.addEventListener('keyup',event=>panKeys.delete(event.key.toLowerCase()));
 window.addEventListener('blur',()=>panKeys.clear());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)panKeys.clear();});
 document.addEventListener('focusin',event=>{const target=event.target;if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select')))panKeys.clear();});
 function updateUI(now:number){
   const report=metrics.report();state.fps=report.fps;state.frameMs=report.medianMs;
   state.metal=run.model.metal;state.baseHealth=run.model.baseHealth/20*100;state.level=run.model.level;state.wave=run.model.wave;state.waveCount=run.model.waveCount;state.phase=state.mode==='lab'?'combat':run.model.phase;
   state.selected=run.model.towers.find(t=>t.id===run.model.selected)??null;state.bonusChoices=state.mode==='game'?run.model.bonusChoices:[];state.extractionXp=run.extractionXp;
   state.boss=latest.boss;state.bossHealth=latest.boss?.active?latest.boss.health/latest.boss.maxHealth*100:undefined;state.commandUpgrades=state.mode==='game'?run.model.commandUpgrades:[];state.commandXp=progression.xp;state.metaUpgrades=progression.upgrades();
   ui.update(state);positionInspector();if(now-lastAutosave>1500){saveSession();lastAutosave=now;}lastUI=now;
   diagnosticText.textContent=JSON.stringify({adapter:gpu.adapter,abi:'passed',epoch,tick:clock.tick,simulationSeconds:simulatedTime,slots:count,live:latest.live,requested:requestedPopulation,invalid:latest.invalid,peakPacking:latest.maxPacking,crushKills:latest.crushKills,kills:latest.kills,medianMs:report.medianMs,p95Ms:report.p95Ms,frameSamples:report.samples,canvas:[ui.canvas.width,ui.canvas.height],readbackErrors:errors,boss:latest.boss},null,2);
 }
 function positionInspector(){
   selectedInspector.classList.toggle('has-selection',!!state.selected);
   if(!state.selected)return;
   const point=renderer.worldToScreen(state.selected.x,state.selected.y),arena=ui.canvas.parentElement!.getBoundingClientRect(),width=selectedInspector.offsetWidth||340,height=selectedInspector.offsetHeight||280;
   selectedInspector.style.left=`${Math.max(12,Math.min(arena.width-width-12,point.x-arena.left-width/2))}px`;
   selectedInspector.style.top=`${Math.max(12,Math.min(arena.height-height-12,point.y-arena.top-height/2))}px`;
 }
 function tick(){
   clock.tick++;simulatedTime+=clock.step;
   if(state.mode==='game')run.accrueVeterancy(clock.step);
   if(state.mode==='game'&&run.model.phase==='combat'){
     const batches=run.takeSpawns(gpu.shared.capacity-count,clock.step);
     if(batches.length){const data=createParticles(batches,map,gpu.shared.capacity-count,spawnSlot);const added=data.length/PARTICLE_FLOATS;spawnSlot+=added;gpu.device.queue.writeBuffer(gpu.shared.particles,count*PARTICLE_FLOATS*4,data.buffer);count+=added;state.population+=added;}
   }
   const wireStats=barbedWireStats(run.model.commandUpgrades),activeWires=builtWires.filter(wire=>!wire.breached);
   const effects=[...activeWires.map(wire=>({x:wire.x+wire.width/2,y:wire.y+wire.height/2,kind:'slow' as const,radius:3.2,strength:.55,damage:wireStats.damage*clock.step,direction:{x:0,y:0},cone:0,duration:wireStats.slow,source:0})),...commands].slice(0,64);commands=[];
   if(state.mode==='game'&&run.model.phase==='combat'&&(builtWalls.length||builtWires.length)){
     const obstacleSnapshot=map.obstacles,telemetry=(segment:Rect)=>{const index=obstacleSnapshot.indexOf(segment);return index<0?{contact:0,packing:0,pressure:0}:{contact:Math.min(1,(latest.obstacleContacts?.[index]??0)/6),packing:latest.obstaclePacking?.[index]??0,pressure:latest.obstaclePressure?.[index]??0};};
     const wallLevel=run.model.commandUpgrades.filter(id=>/^wall-engineering-\d+$/.test(id)).length;
     const collapsed=builtWalls.filter(wall=>{const sample=telemetry(wall);wall.health=wallHealthAfterPressure(wall.health,sample.pressure,sample.contact,clock.step,wallLevel);return wall.health<=0;});
     const breached=builtWires.filter(wire=>{if(wire.breached)return false;const sample=telemetry(wire);wire.health-=clock.step*wireStats.damage*sample.contact*(1+Math.max(0,sample.packing-1)*.4);if(sample.contact>0&&sample.packing>=wireStats.resistance){wire.breached=true;return true;}return false;});
     for(const wire of builtWires)if(wire.breached)wire.health-=wire.maxHealth*clock.step*.45;
     const spent=builtWires.filter(wire=>wire.health<=0);
     if(collapsed.length||breached.length||spent.length){
       for(const wall of collapsed)burst({x:wall.x+wall.width/2,y:wall.y+wall.height/2},30,[.48,.54,.6],8,1.1,10,'debris',1.6);
       for(const wire of breached){const center={x:wire.x+wire.width/2,y:wire.y+wire.height/2};burst(center,24,[1,.32,.08],14,.75,10,'spark',1.15);burst(center,22,[.5,.6,.62],9,1.05,9,'debris',1.45);burst(center,7,[.2,.19,.16],4,1.25,-2,'smoke',2.2);}
       for(const wire of spent)if(!breached.includes(wire))burst({x:wire.x+wire.width/2,y:wire.y+wire.height/2},22,[.56,.42,.22],8,.9,9,'debris',1.3);
       builtWalls=builtWalls.filter(wall=>!collapsed.includes(wall));builtWires=builtWires.filter(wire=>!spent.includes(wire));
       removeStructuresFromMap([...collapsed,...breached,...spent]);
       state.message=collapsed.length?`${collapsed.length} Metal wall section${collapsed.length===1?'':'s'} collapsed under local pressure.`:breached.length?`${breached.length} barbed wire section${breached.length===1?'':'s'} gave way under local swarm pressure.`:`${spent.length} barbed wire section${spent.length===1?'':'s'} wore out.`;
     }
   }
   const frame:CombatFrame={dt:clock.step,tick:clock.tick,count,map,effects,tuning:DEFAULT_TUNING,navigation,lab:state.mode==='lab',towers:state.mode==='game'?run.model.towers.map(tower=>({tower,definition:compileTower(tower,run.model.bonuses,run.model.commandUpgrades,progression.ranks())})):[]};
   const encoder=gpu.device.createCommandEncoder({label:`Simulation tick ${clock.tick}`});
   const bossFrame={dt:clock.step,tick:clock.tick,count,map:{...map,spawn:{x:50,y:35,width:32,height:30}},active:state.mode==='game'&&run.isBossWave};
   combat.encodeBefore(encoder,frame);boss.encode(encoder,bossFrame);physics.encode(encoder,frame);combat.encodeAfter(encoder,frame);boss.encodeResolve(encoder,bossFrame);
   let finish:(()=>void)|undefined,finishShots:(()=>void)|undefined;
   if(clock.tick-lastTickSample>=6){finish=settlement.encode(encoder,gpu.shared.counters,epoch,clock.tick);if(finish)lastTickSample=clock.tick;}
   if(clock.tick%3===0)finishShots=shotReader.encode(encoder,combat.shotState,frame.towers.length);
   gpu.device.queue.submit([encoder.finish()]);finish?.();finishShots?.();
 }
 function frame(now:number){
   if(failed)return;
   try{
     const elapsed=(now-previous)/1000;previous=now;metrics.push(elapsed*1000);
     const active=state.mode==='lab'||run.model.phase==='combat'||run.model.phase==='settling';
     if(!editor.active&&panKeys.size){const speed=52*elapsed;renderer.pan((panKeys.has('d')?speed:0)-(panKeys.has('a')?speed:0),(panKeys.has('s')?speed:0)-(panKeys.has('w')?speed:0));}
     const steps=editor.active?0:clock.advance(elapsed,state.paused||!active);
     for(let i=0;i<steps;i++)tick();
     if(!state.paused){for(const effect of visuals)effect.duration-=elapsed;visuals=visuals.filter(e=>e.duration>0);for(const particle of visualParticles)particle.age+=elapsed;visualParticles=visualParticles.filter(particle=>particle.age<particle.life);}
     const encoder=gpu.device.createCommandEncoder({label:'Present'});
     const placement=pointer?towerPlacement(pointer):undefined;
     const wallPlacement=pointer?wallAt(pointer):undefined;
     const ghost=state.mode==='game'&&state.selectedKind&&placement?{...placement,kind:state.selectedKind,range:compileTower({id:0,kind:state.selectedKind,x:placement.x,y:placement.y,level:0,branch:-1,angle:0,cooldown:0,spent:0},run.model.bonuses,run.model.commandUpgrades,progression.ranks()).range,valid:canPlace(map,run.model.towers,placement,1.25,builtWalls)&&run.model.phase!=='won'&&run.model.phase!=='lost'}:undefined;
     const wallGhost=state.mode==='game'&&wallTool&&wallPlacement?{...wallPlacement,valid:builtWalls.some(wall=>wall.x===wallPlacement.x&&wall.y===wallPlacement.y&&wall.health<wall.maxHealth)||!validateEditorMap({...map,obstacles:[...map.obstacles,wallPlacement]})}:undefined;
     renderer.encode(encoder,{count:editor.active?0:count,time:simulatedTime,map:editor.active?editor.map:map,towers:!editor.active&&state.mode==='game'?run.model.towers:[],effects:editor.active?[]:visuals,visualParticles:editor.active?[]:visualParticles,walls:editor.active?[]:builtWalls,wires:editor.active?[]:builtWires,heatmap:state.heatmap,selection:run.model.selected,ghost:editor.active?undefined:ghost,wallGhost,boss:!editor.active&&latest.boss?.active?latest.boss:undefined});
     gpu.device.queue.submit([encoder.finish()]);
     if(now-lastUI>100)updateUI(now);else positionInspector();
     requestAnimationFrame(frame);
   }catch(error){fail(error);}
 }
 let restored=false;
 if(state.mode==='game'){try{restoreSession();restored=true;}catch{/* Invalid or absent autosaves leave the fresh defense untouched. */}}
 resetWorld(!restored);updateUI(performance.now());requestAnimationFrame(frame);
} catch(error){state.message=String(error);state.paused=true;ui.update(state);console.error(error);}

}

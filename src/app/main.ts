import '../coop/style.css';
import {mountCoop} from '../coop/host.ts';
import {createWallInspector} from '../ui/wall-inspector.ts';
import {firingObstacles, createStructurePreview, clearPlayerTerrain, restoreSessionTerrain, terrainMounts, wallMountCells} from '../game/terrain.ts';
import {createInfantryController} from '../infantry/controller.ts';
import {createInfantryGPU} from '../infantry/gpu.ts';
import {advanceInfantry,awardInfantryKills,infantryMap,freshInfantry} from '../infantry/model.ts';
import {damMap,DAM_ID,DAM_GATES,freshDam,sameRect,validDam} from '../content/dam.ts';
import {advanceDam,advanceCurrents,releaseFlood,toggleDamGate} from '../game/dam.ts';
import {campaignMap,isCampaignMap} from '../content/levels.ts';
import {allBattlefields,battlefield} from '../content/battlefields.ts';
import {AUTOSAVE_KEY as DEFAULT_AUTOSAVE_KEY, CHECKPOINT_KEY as DEFAULT_CHECKPOINT_KEY, saveDefense, loadDefense} from '../persistence/defense.ts';
import { connectGPU } from '../runtime/gpu.ts';
import { verifyABI } from '../runtime/abi-check.ts';
import { FixedClock } from '../runtime/clock.ts';
import { FrameMetrics, SimulationRate } from '../runtime/metrics.ts';
import {CPUProfiler,GPUProfiler} from '../runtime/profiler.ts';
import {createTowerDefinitionCache} from '../content/tower-cache.ts';
import {mountGraphicsSettings} from '../ui/graphics.ts';
import { SettlementReader } from '../runtime/readback.ts';
import {makeGameWindow} from '../ui/windows.ts';
import { createLevelEditor, validateEditorMap, wallAtPoint } from '../editor/index.ts';
import '../editor/style.css';
import { createUI } from '../ui/index.ts';
import { createRenderer } from '../render/index.ts';
import {createAudio} from '../audio/index.ts';
import {mountRedAlertSoundtrack} from '../audio/red-alert-soundtrack.ts';
import {createBoss} from '../sim/bosses/index.ts';
import {createHorde} from '../sim/horde/index.ts';
import {HordeFront,HordeCapacity,encodeHorde} from '../sim/horde/model.ts';
import { createPhysics } from '../sim/physics/index.ts';
import { createCombat, type CombatFrame } from '../sim/combat/index.ts';
import { barbedWireStats, createParticles, DEFAULT_MAP, compileTower, techRank, TOWERS } from '../content/index.ts';
import { crusherPassageIssue, buildNavigation, canPlace, mapWithTurretObstacles, resolvePlacement, turretObstacles } from '../navigation/index.ts';
import {BASE_FENCE_DURABILITY, barrierHealthAfterExplosion, CHAINLINK_FENCE_COST, fenceHealthAfterPressure, METAL_WALL_COST, wallCapacity, wallHealthAfterPressure} from '../sim/walls/model.ts';
import { createRun, STARTING_METAL, TOWER_MOVE_COST, waveFor } from '../game/index.ts';
import { COUNTER_WORDS, DEFAULT_TUNING, HORDE_APPROACH, PARTICLE_FLOATS, type UIState, type GameAction, type Effect, type Vec2, type Rect, type Settlement, type VisualParticle, type VisualParticleStyle, type WorldMap, type HeavyProjectile, type HeavyExplosion, type InfantryRocketProjectile, type InfantryRocketExplosion } from '../contracts/index.ts';
import {ShotEventReader} from '../runtime/shot-events.ts';
import {advanceHeavyProjectiles,createHeavyProjectiles,type HeavyImpact} from '../effects/heavy-weapons.ts';
import {turretEjection,turretMuzzlePoint,turretMuzzlePoints} from '../render/turret-art.ts';
import {infantryMuzzle} from '../render/infantry-animation.ts';
import {formatPressure,MANUAL_BLAST_PEAK_KPA,MANUAL_PUSH_PEAK_KPA} from '../sim/pressure/model.ts';
import {barrierCost,barrierLength,barrierSegments,MIN_BARRIER_LENGTH,pointToBarrierDistance,sampleBarrier,simplifyBarrier,snapBarrierEndpoints,barrierRectDistance,barrierPlacementConflict,type BarrierKind,type BarrierSegment} from '../game/barrier-path.ts';
import {installInteractionGuards} from './interaction-guards.ts';

const root=document.querySelector<HTMLElement>('#app')!;
installInteractionGuards();
const params=new URLSearchParams(location.search);
const TURRET_HIT_RADIUS=2.25;
const requestedMap=params.get('map');
const damScenario=requestedMap==='dam'||requestedMap==='pressure-front-hydroelectric';
const initialMap=damScenario?damMap():/^\d+$/.test(requestedMap??'')?campaignMap(Math.max(1,Math.min(3,Number(requestedMap)))):battlefield(requestedMap??campaignMap(1).id);
const AUTOSAVE_KEY=damScenario?'pressure-front.dam.autosave.v1':initialMap.id===campaignMap(1).id?DEFAULT_AUTOSAVE_KEY:`pressure-front.${initialMap.id}.autosave.v1`;
const CHECKPOINT_KEY=damScenario?'pressure-front.dam.checkpoint.v1':initialMap.id===campaignMap(1).id?DEFAULT_CHECKPOINT_KEY:`pressure-front.${initialMap.id}.checkpoint.v1`;
if(location.pathname.startsWith('/coop')||params.has('join')) {
 const {mountPartner}=await import('../coop/partner.ts');await mountPartner(root);
} else if(params.has('validate')) {
 const {showValidation}=await import('./validation-page.ts');await showValidation(root);
} else {
const run=createRun(initialMap);
const state:UIState={mode:params.get('mode')==='lab'?'lab':'game',phase:'preparation',paused:false,simulationSpeed:1,fps:0,frameMs:0,population:10000,capacity:65536,kills:0,crushKills:0,leaks:0,earned:0,maxPressure:0,metal:STARTING_METAL,baseHealth:100,level:1,wave:0,waveCount:10,difficulty:1,streamWidth:60,selected:null,upgradeTarget:null,selectedKind:null,buildTool:null,upgradeMode:false,moveMode:false,targetMode:false,heatmap:true,tool:'blast',message:'Connecting to local GPU…',adapter:'WebGPU',bonusChoices:[],bonuses:[],commandUpgrades:[],statUpgrades:run.statUpgrades(),towerUnlocks:run.towerUnlocks()};
let handleAction:(action:GameAction)=>void=()=>{};
const ui=createUI(root,action=>handleAction(action));
try {
 mountRedAlertSoundtrack(root);
 const gpu=await connectGPU(ui.canvas,{profile:params.has('profile')});
 const profiler=params.has('profile')?new GPUProfiler(gpu.device):undefined;
 const cpuProfile=profiler?new CPUProfiler():undefined;
 let lastProfileReport=0,profileSnapshot:{cpuProfile?:ReturnType<CPUProfiler['report']>;gpuProfile?:ReturnType<GPUProfiler['report']>}={};
 const simulationRate=new SimulationRate();
 const cachedTower=createTowerDefinitionCache();
 const graphics=mountGraphicsSettings(root);
 let failed=false;
 function fail(error:unknown){if(failed)return;failed=true;state.message=String(error instanceof Error?error.message:error);state.paused=true;ui.update(state);console.error(error);}
 gpu.device.addEventListener('uncapturederror',event=>fail(event.error.message));
 void gpu.device.lost.then(info=>fail(`GPU connection lost: ${info.message}. Reload to reconnect.`));
 if(!await verifyABI(gpu.device))throw new Error('GPU particle layout check failed.');
 state.adapter=`${gpu.adapter} / WEBGPU`;
 const boss=await createBoss(gpu.device,gpu.shared);
 const combat=await createCombat(gpu.device,gpu.shared);
 const physics=await createPhysics(gpu.device,gpu.shared,{crowdMode:params.get('solver')==='hybrid'?'hybrid':'exact'});
 const infantryGPU=await createInfantryGPU(gpu.device,gpu.shared);
 const horde=await createHorde(gpu.device,gpu.shared), hordeFront=new HordeFront(), hordeCapacity=new HordeCapacity();
 const enemiesActive=()=>['combat','settling'].includes(run.model.phase)||(['preparation','checkpoint'].includes(run.model.phase)&&run.hasRemainingEnemies);
 const resetHorde=()=>{horde.reset();hordeFront.reset();hordeCapacity.reset();};
 gpu.shared.shotState=combat.shotState;
 const renderer=await createRenderer(gpu.device,gpu.context,gpu.format,gpu.shared,ui.canvas,{turretArt:params.get('turretArt')==='red-alert'?'red-alert':'soldat',floorArt:params.get('floor')==='grating'?'grating':'panels'});
 const setCombatAudioGain=()=>audio.setCombatGain(renderer.combatAudioScale?.()??1);
 const audio=createAudio();
 const selectedInspector=ui.canvas.parentElement!.querySelector<HTMLElement>('.selected-popup')!;
 const upgradeInspector=ui.canvas.parentElement!.querySelector<HTMLElement>('.upgrade-hover-card')!;
 const pressureLayer=document.createElement('div');pressureLayer.className='pressure-popups';ui.canvas.parentElement!.append(pressureLayer);
 const clock=new FixedClock(), metrics=new FrameMetrics();
 let map=initialMap, navigation=buildNavigation(map), spawnBaseline=initialMap.spawn;
 let epoch=run.epoch,count=0,spawnSlot=0, requestedPopulation=Math.min(50000,Math.max(1,Number(params.get('population'))||10000));
 let builtWalls:(Rect & {health:number;maxHealth:number})[]=[],movingTowerId:number|null=null,targetingTowerId:number|null=null;
/* Recycle hover branch variant is superseded here by the placement-preview wall model. */
 let builtWires:(BarrierSegment & {health:number;maxHealth:number;breached:boolean})[]=[];
 let builtFences:(BarrierSegment & {health:number;maxHealth:number})[]=[];
 let nextBarrierRun=1;
 type PressurePopup={element:HTMLElement;x:number;y:number;age:number;life:number;drift:number};
 let commands:Effect[]=[], visuals:Effect[]=[], visualParticles:VisualParticle[]=[], heavyProjectiles:HeavyProjectile[]=[], heavyExplosions:HeavyExplosion[]=[], infantryRocketProjectiles:InfantryRocketProjectile[]=[], infantryRocketExplosions:InfantryRocketExplosion[]=[], pressurePopups:PressurePopup[]=[], cameraShake=0, pointer:Vec2|undefined, infantryDrag:{start:Vec2;current:Vec2;clientX:number;clientY:number;additive:boolean}|undefined, barrierDrag:{kind:BarrierKind;points:Vec2[];pointerId:number}|undefined, hoveredTowerId:number|null=null, hoverClearTimer=0, lastTickSample=0, waveStartTick=0;
 const lastTowerPressurePopup=new Map<number,number>();
 let latest:Settlement={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0},previousInfantryKills:number[]=[];
 let lastUI=0, previous=performance.now(), simulatedTime=0;
 const diagnostics=document.createElement('details');diagnostics.className='diagnostics';diagnostics.innerHTML='<summary>Developer diagnostics</summary><pre></pre>';root.append(diagnostics);
 const diagnosticText=diagnostics.querySelector('pre')!;
 const errors:string[]=[];
 let previousPaused=false;
 let lastAutosave=0;
 const towerMounts=()=>[...terrainMounts(clearPlayerTerrain(map,builtWalls,builtWires,builtFences)),...wallMountCells(builtWalls.filter(wall=>map.obstacles.some(obstacle=>obstacle.x===wall.x&&obstacle.y===wall.y&&obstacle.width===wall.width&&obstacle.height===wall.height)))];
 const syncTowerMounts=()=>run.setBuildMounts(towerMounts());
 const combatMap=()=>mapWithTurretObstacles(state.mode==='game'?infantryMap(map,run.model.infantry??freshInfantry()):map,state.mode==='game'?run.model.towers:[]);
 const refreshNavigation=()=>{navigation=buildNavigation(combatMap());};
 const wallInspector=createWallInspector(root,gpu.device,gpu.shared);
 const infantry=createInfantryController(root,run,()=>map,refreshNavigation,text=>{state.message=text;},()=>{state.selectedKind=null;state.buildTool=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;run.model.selected=null;});
 const resizeSpawn=()=>{const width=Math.max(1,Math.min(100,Math.round(state.streamWidth)));map={...map,spawn:{...spawnBaseline,y:(map.height-width)/2,height:width}};};
 const restoreSegment=<T extends {x:number;y:number;width:number;height:number}>(kind:BarrierKind,segment:T,index:number)=>{const saved=segment as T&Partial<BarrierSegment>;return {...segment,from:saved.from??{x:segment.x,y:segment.y+segment.height/2},to:saved.to??{x:segment.x+segment.width,y:segment.y+segment.height/2},run:saved.run??index+1,kind} as T&BarrierSegment;};
 const saveSession=()=>{if(state.mode!=='game'||run.hasRemainingEnemies||!['preparation','checkpoint'].includes(run.model.phase))return;try{const runState=damScenario?run.serialize():run.save();localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState,map,spawnBaseline,builtWalls,builtWires,builtFences,difficulty:state.difficulty,streamWidth:state.streamWidth}));}catch{/* Local persistence is optional. */}};
 const restoreSession=()=>{try{const saved=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)??'null') as {runState?:string;map?:WorldMap;spawnBaseline?:Rect;builtWalls?:(Rect & Partial<{health:number;maxHealth:number}>)[];builtWires?:(Rect & {health:number;maxHealth:number;breached:boolean})[];builtFences?:(Rect & {health:number;maxHealth:number})[];difficulty?:number;streamWidth?:number}|null;if(!saved?.runState||!saved.map||saved.map.id!==initialMap.id||!validDam(saved.map))return false;builtWalls=(saved.builtWalls??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y)).map(w=>{const maxHealth=typeof w.maxHealth==='number'&&Number.isFinite(w.maxHealth)?w.maxHealth:wallCapacity(0),health=typeof w.health==='number'&&Number.isFinite(w.health)?w.health:maxHealth;return {...w,health,maxHealth};});builtWires=(saved.builtWires??[]).filter(w=>Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.health)).map((wire,index)=>restoreSegment('wire',wire,index));builtFences=(saved.builtFences??[]).filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&Number.isFinite(f.health)).map((fence,index)=>restoreSegment('fence',fence,index));nextBarrierRun=1+Math.max(0,...builtWires.map(wire=>wire.run),...builtFences.map(fence=>fence.run));const defaultSession=saved.map.id===DEFAULT_MAP.id;map=restoreSessionTerrain(saved.map,DEFAULT_MAP,builtWalls,builtWires,builtFences);spawnBaseline=defaultSession?DEFAULT_MAP.spawn:saved.spawnBaseline??saved.map.spawn;state.difficulty=run.setSpawnMultiplier(saved.difficulty??1);state.streamWidth=Math.max(1,Math.min(100,Math.round(saved.streamWidth??map.spawn.height)));resizeSpawn();run.setMap(map);syncTowerMounts();const loaded=run.load(saved.runState).ok;if(loaded)refreshNavigation();return loaded;}catch{return false;}};
 const editor=createLevelEditor(root.querySelector<HTMLElement>('.view-menu')!,map,newMap=>{
   map=newMap;if(map.id!==DAM_ID)delete map.dam;spawnBaseline=newMap.spawn;builtWalls=[];builtWires=[];builtFences=[];nextBarrierRun=1;resizeSpawn();navigation=buildNavigation(map);run.setMap(map);syncTowerMounts();state.mode='game';resetWorld();previousPaused=false;
   state.message='Custom level ready. Build your defense, then start a wave.';
 },active=>{if(active){previousPaused=state.paused;state.paused=true;state.selectedKind=null;state.buildTool=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.message='Paint walls on the arena. Right-drag erases. Apply & Play starts a fresh defense.';}else{state.paused=previousPaused;}},root.querySelector<HTMLElement>('.view-actions')!);
 makeGameWindow(root.querySelector<HTMLElement>('.level-editor-panel')!,'LEVEL EDITOR');
 const newGame=()=>{try{localStorage.removeItem(AUTOSAVE_KEY);if(!damScenario)localStorage.removeItem('pressure-front.customlevel.v1');}catch{/* Local persistence is optional. */}if(!damScenario)run.clearSave();state.mode='game';state.difficulty=1;state.streamWidth=60;map=battlefield(initialMap.id);spawnBaseline=map.spawn;editor.setMap(map);resizeSpawn();builtWalls=[];builtWires=[];builtFences=[];nextBarrierRun=1;navigation=buildNavigation(map);run.setMap(map);syncTowerMounts();resetWorld();state.message='New game started.';};

 const settlement=new SettlementReader(gpu.device,s=>{
   if(s.epoch!==epoch)return;
   if(s.tick<waveStartTick)return;
   hordeCapacity.settle(s.tick,s.live);
   const currentLive=gpu.shared.capacity-hordeCapacity.available(gpu.shared.capacity);
   latest=s;state.population=currentLive;state.kills=s.kills;state.crushKills=s.crushKills;state.leaks=s.leaks;state.earned=s.earned;state.maxPressure=Math.max(state.maxPressure,s.maxPressure??0);
   if(state.mode==='game'){
     const reported=s.infantryKills??[],earnedBySoldier=reported.map((total,index)=>Math.max(0,total-(previousInfantryKills[index]??0)));
     awardInfantryKills(infantry.state(),infantryGPU.liveIds,earnedBySoldier);previousInfantryKills=[...reported];
     run.applySettlement({...s,live:currentLive});
     if(currentLive===0&&count>0&&s.tick>=waveStartTick&&run.model.pending.length===0&&run.model.phase==='combat'){
       const clearedWave=run.model.wave,result=run.finishSettling();if(result.ok){const checkpoint=clearedWave>=10;state.message=checkpoint?`Wave ${clearedWave} contained. Extract or continue with your Metal and research.`:run.model.bonusChoices.length?'Wave cleared. Choose a command boon.':'Wave cleared. Spend your Metal on defenses and research.';count=0;}
     }
   }
 },error=>errors.push(String(error)));
 function resetWorld(resetRun=true,level=1){
   wallInspector.select(undefined);
   infantryGPU.reset();infantry.reset();previousInfantryKills=[];
   if(resetRun){
     if(map.id===DAM_ID){map.dam=freshDam();map.obstacles=map.obstacles.filter(r=>!DAM_GATES.some(g=>sameRect(g,r)));}
     map=clearPlayerTerrain(map,builtWalls,builtWires,builtFences);builtWalls=[];builtWires=[];builtFences=[];nextBarrierRun=1;
     run.setMap(map);syncTowerMounts();run.reset(level);refreshNavigation();
   }
   epoch=run.epoch;
   physics.reset();combat.reset();combat.clearAftermath();renderer.clearAftermath?.();resetHorde();shotReader.reset();boss.reset(false);clock.reset();metrics.reset();lastTickSample=0;waveStartTick=0;simulatedTime=0;
   gpu.device.queue.writeBuffer(gpu.shared.counters,0,new Uint32Array(COUNTER_WORDS));
   commands=[];visuals=[];visualParticles=[];heavyProjectiles=[];heavyExplosions=[];infantryRocketProjectiles=[];infantryRocketExplosions=[];for(const popup of pressurePopups)popup.element.remove();pressurePopups=[];lastTowerPressurePopup.clear();cameraShake=0;count=0;spawnSlot=0;hoveredTowerId=null;movingTowerId=null;targetingTowerId=null;state.kills=state.crushKills=state.leaks=state.earned=state.maxPressure=0;state.selectedKind=null;state.selected=null;state.upgradeTarget=null;state.buildTool=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;state.paused=false;
   latest={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
   if(state.mode==='lab'){
     const batches=requestedPopulation<=10000?[{count:Math.floor(requestedPopulation*.8),kind:'shambler' as const,seed:1},{count:Math.floor(requestedPopulation*.15),kind:'runner' as const,seed:2},{count:requestedPopulation-Math.floor(requestedPopulation*.8)-Math.floor(requestedPopulation*.15),kind:'brute' as const,seed:3}]:[{count:requestedPopulation,kind:'shambler' as const,seed:1}];
     const data=createParticles(batches,map,gpu.shared.capacity,spawnSlot);count=data.length/PARTICLE_FLOATS;spawnSlot+=count;gpu.device.queue.writeBuffer(gpu.shared.particles,0,data.buffer);
     state.message=count<requestedPopulation?`Spawn area fits ${count.toLocaleString()} of ${requestedPopulation.toLocaleString()} requested.`:'Click the crowd to detonate. Push it against a wall to crush it.';
   }else state.message=map.dam?'Thunderhead Dam: build on concrete islands; divert with gates; release floods with F.':'Build near the choke. Select a tower, then click a clear location.';
   state.population=count;previous=performance.now();
 }
 const sameRect=(left:Rect,right:Rect)=>left.x===right.x&&left.y===right.y&&left.width===right.width&&left.height===right.height;
 const removeStructuresFromMap=(structures:readonly Rect[])=>{map={...map,obstacles:map.obstacles.filter(obstacle=>!structures.some(structure=>sameRect(obstacle,structure)))};run.setMap(map);syncTowerMounts();refreshNavigation();};
 const distanceToRect=(point:Vec2,rect:Rect)=>Math.hypot(Math.max(rect.x-point.x,0,point.x-(rect.x+rect.width)),Math.max(rect.y-point.y,0,point.y-(rect.y+rect.height)));
 const damageBarriersFromExplosion=(point:Vec2,radius:number)=>{for(const fence of builtFences)fence.health=barrierHealthAfterExplosion(fence.health,fence.maxHealth,distanceToRect(point,fence),radius);for(const wire of builtWires)wire.health=barrierHealthAfterExplosion(wire.health,wire.maxHealth,distanceToRect(point,wire),radius);};
 const clearPlayerStructures=()=>{removeStructuresFromMap([...builtWalls,...builtWires,...builtFences]);builtWalls=[];builtWires=[];builtFences=[];nextBarrierRun=1;syncTowerMounts();};
 const actionResult=(result:{ok:boolean;reason?:string},success:string)=>{state.message=result.ok?success:result.reason||'Action unavailable.';};
 const setUpgradeTarget=(id:number|null)=>{window.clearTimeout(hoverClearTimer);if(hoveredTowerId===id)return;hoveredTowerId=id;state.upgradeTarget=id===null?null:run.model.towers.find(tower=>tower.id===id)??null;ui.update(state);positionUpgradeInspector();};
 const scheduleUpgradeTargetClear=()=>{window.clearTimeout(hoverClearTimer);hoverClearTimer=window.setTimeout(()=>setUpgradeTarget(null),140);};
 upgradeInspector.addEventListener('pointerenter',()=>window.clearTimeout(hoverClearTimer));
 upgradeInspector.addEventListener('pointerleave',scheduleUpgradeTargetClear);
 handleAction=action=>{
   if(failed)return;
   if(editor.active){state.message='Apply or cancel your level before using game controls.';return;}
   if(['select-tower','wall-tool','fence-tool','wire-tool','demolish-tool','upgrade-tool','move','set-ground-target','mode','new-game','reset','load','restart-wave'].includes(action.type))infantry.cancel();
   if(['start-wave','restart-wave','continue-run','load'].includes(action.type))infantryGPU.reset();
   switch(action.type){
     case 'select-map':saveSession();location.assign(`/?map=${encodeURIComponent(action.map)}`);break;
     case 'mode':state.mode=action.mode;resetWorld();break;
     case 'pause':state.paused=!state.paused;break;
     case 'simulation-speed':if(!editor.active&&[1,2,3,5].includes(action.value)){state.simulationSpeed=action.value;state.paused=false;}break;
     case 'dam-north':case 'dam-south':{
       if(editor.active||state.paused||state.mode!=='game'||!['preparation','combat'].includes(run.model.phase)){state.message='Resume the defense to operate floodgates.';break;}
       const index=action.type==='dam-north'?0:1;
       const issue=toggleDamGate(map,index,run.model.towers);
       if(issue){state.message=issue;break;}
       if(run.model.phase==='preparation')map.dam!.switchCooldown=0;
       run.setMap(map);syncTowerMounts();refreshNavigation();audio.fire('crusher',66,clock.tick);cameraShake=.18;
       state.message=`${index===0?'NORTH':'SOUTH'} FLOODGATE ${map.dam!.closed[index]?'CLOSED — HORDE DIVERTED':'OPEN — CHANNEL RESTORED'}`;break;
     }
     case 'dam-flood':{
       if(editor.active||state.paused||state.mode!=='game'||run.model.phase!=='combat'||!releaseFlood(map)){state.message='Flood release needs active combat and a full reservoir.';break;}
       cameraShake=1;audio.flood();for(const y of [24,50,76])burst({x:128,y},35,[.55,.9,1],18,1.6,-2,'mist',3);
       state.message='SPILLWAY RELEASE — SWEEP THE HORDE BACK';break;
     }
     case 'slam-gates':{
       if(state.paused){state.message='Resume combat before slamming gates.';break;}
       const ready=run.model.towers.filter(t=>t.kind==='crusher'&&t.cooldown<=0).length;
       if(commands.length+ready>64-(map.dam?3:0)){state.message='Wait for the current effects before slamming.';break;}
       const slams=run.slamCrushers();commands.push(...slams);
       for(const slam of slams){visuals.push({...slam});burst(slam,36,[1,.65,.15],15,.65,9,'spark',1.1);burst(slam,18,[.55,.6,.65],10,.8,12,'debris',1.2);showPressure(slam,slam.peakPressureKpa??900,clock.tick);audio.fire('crusher',slam.x,clock.tick);}
       if(slams.length){cameraShake=Math.max(cameraShake,.85);state.message=`${slams.length} CRUSHER GATE${slams.length===1?'':'S'} SLAMMED — RECHARGING`;}
       else state.message='Gates need combat and a full recharge before another slam.';
       break;
     }
     case 'reset':clearPlayerStructures();resetWorld(true,run.model.level);state.message='Level restarted. Placed defenses and run upgrades were removed.';break;
     case 'restart-wave':{
       const result=run.restartWave();actionResult(result,'Wave restarted. Defenses remain in position.');if(!result.ok)break;
       epoch=run.epoch;count=0;spawnSlot=0;commands=[];visuals=[];visualParticles=[];heavyProjectiles=[];heavyExplosions=[];infantryRocketProjectiles=[];infantryRocketExplosions=[];for(const popup of pressurePopups)popup.element.remove();pressurePopups=[];lastTowerPressurePopup.clear();cameraShake=0;state.population=0;state.kills=state.crushKills=state.leaks=state.earned=state.maxPressure=0;
       latest={epoch,tick:clock.tick,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
       gpu.device.queue.writeBuffer(gpu.shared.counters,0,new Uint32Array(COUNTER_WORDS));previousInfantryKills=[];physics.reset();combat.reset();combat.clearAftermath();renderer.clearAftermath?.(true);resetHorde();shotReader.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;lastTickSample=clock.tick;state.paused=false;state.selectedKind=null;
       break;
     }
     case 'new-game':newGame();break;
     case 'heatmap':state.heatmap=action.value;break;
     case 'population':if(state.mode==='lab'){requestedPopulation=action.value;resetWorld();}break;
     case 'tool':state.tool=action.tool;state.selectedKind=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;break;
     case 'select-tower':if(action.kind&&!run.isTowerUnlocked(action.kind)){state.selectedKind=null;state.message=`${TOWERS[action.kind].name} is locked. Unlock it with Metal first.`;break;}state.buildTool=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;run.model.selected=null;state.selectedKind=state.selectedKind===action.kind?null:action.kind;state.message=state.selectedKind?`${TOWERS[state.selectedKind].name}: click a clear build location.`:'Click a tower to inspect it.';break;
     case 'unlock-tower':{const result=run.unlockTower(action.kind);actionResult(result,`${TOWERS[action.kind].name} unlocked for this run.`);state.selectedKind=null;break;}
     case 'wall-tool':state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.buildTool=state.buildTool==='wall'?null:'wall';state.selectedKind=null;state.message=state.buildTool==='wall'?'Wall tool: click to place a 4 × 4 Metal wall, or reinforce a damaged wall to full integrity.':'Wall tool cancelled.';break;
     case 'fence-tool':state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.buildTool=state.buildTool==='fence'?null:'fence';state.selectedKind=null;state.message=state.buildTool==='fence'?'Chain-link: click and drag a straight fence, then release to build. Ends snap to nearby fences.':'Fence tool cancelled.';break;
     case 'wire-tool':state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.buildTool=state.buildTool==='wire'?null:'wire';state.selectedKind=null;state.message=state.buildTool==='wire'?'Barbed wire: click and drag a path, then release to build.':'Barbed wire tool cancelled.';break;
     case 'demolish-tool':state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.buildTool=state.buildTool==='demolish'?null:'demolish';state.selectedKind=null;state.message=state.buildTool==='demolish'?'Demolish tool: click a player-built wall, fence, or barbed wire to recover half its Metal.':'Demolish tool cancelled.';break;
     case 'upgrade-tool':state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;state.upgradeMode=!state.upgradeMode;state.buildTool=null;state.selectedKind=null;state.message=state.upgradeMode?'Upgrade mode: hover a tower to preview its next upgrade. Press Q or E to choose a branch.':'Upgrade mode cancelled.';break;
     case 'move':if(run.model.selected===null)break;movingTowerId=state.moveMode?null:run.model.selected;targetingTowerId=null;state.moveMode=movingTowerId!==null;state.targetMode=false;state.buildTool=null;state.selectedKind=null;state.upgradeMode=false;state.message=state.moveMode?`Move mode: click a clear location for this tower (${TOWER_MOVE_COST} Metal). Its ground target will be cleared.`:'Move mode cancelled.';break;
     case 'set-ground-target':if(run.model.selected===null)break;targetingTowerId=state.targetMode?null:run.model.selected;movingTowerId=null;state.targetMode=targetingTowerId!==null;state.moveMode=false;state.buildTool=null;state.selectedKind=null;state.upgradeMode=false;state.message=state.targetMode?'Focus ground: click a point inside the highlighted range. This turret will ignore enemies elsewhere.':'Ground targeting cancelled.';break;
     case 'clear-ground-target':if(run.model.selected!==null){const result=run.setGroundTarget(run.model.selected,null);targetingTowerId=null;state.targetMode=false;actionResult(result,'Ground target cleared. Automatic targeting restored.');}break;
     case 'skip-wave':{
       const result=run.finishWaveEarly(run.isBossWave&&latest.boss?.active!==false);
       if(!result.ok){state.message=result.reason;break;}
       state.paused=false;
       if(run.model.phase==='preparation'&&!run.model.bonusChoices.length)handleAction({type:'start-wave'});
       else state.message=run.model.bonusChoices.length?'Wave advanced. Remaining enemies stay in play. Choose a command boon.':'Wave advanced. Remaining enemies stay in play. Extract or continue your run.';
       break;
     }
     case 'start-wave':{
       const preserveEnemies=run.hasRemainingEnemies;
       const result=run.startWave();actionResult(result,'Wave incoming. Hold the choke.');if(!result.ok)break;
       if(preserveEnemies){hordeFront.reset();boss.reset(run.isBossWave);state.paused=false;state.selectedKind=null;state.message='Next wave incoming. Surviving enemies remain on the field.';break;}
       latest={...latest,inletBlocked:false};count=0;spawnSlot=0;heavyProjectiles=[];heavyExplosions=[];infantryRocketProjectiles=[];infantryRocketExplosions=[];cameraShake=0;state.population=0;physics.reset();combat.reset();resetHorde();shotReader.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;state.paused=false;state.selectedKind=null;break;
     }
     case 'continue-run':{
       const nextLevel=Math.floor(run.model.wave/10)+1;
       const nextMap=isCampaignMap(map)&&nextLevel!==run.model.level&&nextLevel<=3?campaignMap(nextLevel):undefined;
       const barrierValue=(sections:readonly BarrierSegment[],cost:number)=>[...new Set(sections.map(section=>section.run))].reduce((total,runId)=>total+barrierCost(sections.filter(section=>section.run===runId).reduce((length,section)=>length+Math.hypot(section.to.x-section.from.x,section.to.y-section.from.y),0),cost),0);
       const result=run.continueRun(nextMap,nextMap?builtWalls.length*METAL_WALL_COST+barrierValue(builtFences,CHAINLINK_FENCE_COST)+barrierValue(builtWires,45):0);
       if(result.ok){
         if(nextMap){map=nextMap;spawnBaseline=map.spawn;builtWalls=[];builtWires=[];builtFences=[];nextBarrierRun=1;resizeSpawn();navigation=buildNavigation(map);run.setMap(map);syncTowerMounts();editor.setMap(map);resetWorld(false);state.message=`${map.scenery!.title}: defenses refunded for rebuilding; Metal and research retained.`;saveSession();}
         else state.message=`Defense and research retained. Wave ${run.model.wave+1} is ready.`;
       }else state.message=result.reason;break;
     }
     case 'finish-run':{const result=run.finishRun();if(result.ok){state.message=`Sector secured after ${run.model.wave} waves.`;}else state.message=result.reason;break;}
     case 'upgrade':if(run.model.selected!==null)actionResult(run.upgrade(run.model.selected,action.branch),'Tower upgraded.');break;
     case 'upgrade-tower':{const tower=run.model.towers.find(candidate=>candidate.id===action.id),result=run.upgrade(action.id,action.branch);actionResult(result,result.ok&&tower?`${TOWERS[tower.kind].name} upgraded to level ${tower.level}.`:'Tower upgraded.');break;}
     case 'buy-command':actionResult(run.buyCommandUpgrade(action.id),'Command upgrade installed.');break;
     case 'buy-stat':actionResult(run.buyStatUpgrade(action.id),'Stat upgrade installed for this run.');break;
     case 'sell':if(run.model.selected!==null){const result=run.sell(run.model.selected);if(result.ok){movingTowerId=null;targetingTowerId=null;state.moveMode=false;state.targetMode=false;refreshNavigation();combat.resetAttribution();run.resetTowerAttribution();}actionResult(result,'Tower sold.');}break;
     case 'difficulty':state.difficulty=run.setSpawnMultiplier(action.value);resizeSpawn();state.message=`Horde intensity ${state.difficulty}: denser groups approach from the west.`;break;
     case 'stream-width':state.streamWidth=Math.max(1,Math.min(100,Math.round(action.value)));resizeSpawn();run.setMap(map);refreshNavigation();state.message=`Stream width ${state.streamWidth}. Next-wave quota remains ${waveFor(run.model.level,run.model.wave+1).total.toLocaleString()} zombies.`;break;
     case 'bonus':actionResult(run.chooseBonus(action.id),'Bonus installed for this run.');break;
     case 'save':if(run.hasRemainingEnemies){state.message='Clear the remaining enemies before saving your defense.';break;}try{
       if(state.mode!=='game'||run.hasRemainingEnemies||!['preparation','checkpoint'].includes(run.model.phase))throw new Error('Defenses can only be saved between waves in Game mode.');
       saveDefense(localStorage,CHECKPOINT_KEY,run,{map,spawnBaseline,builtWalls,builtWires,builtFences,difficulty:state.difficulty,streamWidth:state.streamWidth});
       state.message='Defense checkpoint saved. Autosaves will not overwrite it.';
     }catch(error){state.message=`Could not save defense: ${error instanceof Error?error.message:String(error)}`;}break;
     case 'load':try{
       const saved=loadDefense(localStorage,CHECKPOINT_KEY,run);
       map=saved.map;spawnBaseline=saved.spawnBaseline;
       builtWalls=saved.builtWalls.map(wall=>{const stored=wall as Rect & Partial<{health:number;maxHealth:number}>,maxHealth=typeof stored.maxHealth==='number'?stored.maxHealth:wallCapacity(0);return {...stored,health:typeof stored.health==='number'?stored.health:maxHealth,maxHealth};});
       builtWires=saved.builtWires.map((wire,index)=>restoreSegment('wire',wire,index));builtFences=(saved.builtFences??[]).map((fence,index)=>restoreSegment('fence',fence,index));nextBarrierRun=1+Math.max(0,...builtWires.map(wire=>wire.run),...builtFences.map(fence=>fence.run));state.difficulty=saved.difficulty;state.streamWidth=saved.streamWidth??Math.max(1,Math.min(100,Math.round(saved.map.spawn.height)));
       resizeSpawn();navigation=buildNavigation(map);run.setMap(map);syncTowerMounts();state.mode='game';resetWorld(false);
       state.message='Defense checkpoint restored, including terrain and flow.';
     }catch(error){state.message=`Could not load defense: ${error instanceof Error?error.message:String(error)}`;}break;
   }
   if(!state.upgradeMode){hoveredTowerId=null;state.upgradeTarget=null;window.clearTimeout(hoverClearTimer);}
   updateUI(performance.now());
 };
 const previewStructure=createStructurePreview();
 const wallAt=(point:Vec2):Rect=>wallAtPoint(map,point);
 const barrierAt=(point:Vec2):Rect=>({x:point.x-.36,y:point.y-.36,width:.72,height:.72});
 const overlaps=(left:Rect,right:Rect)=>left.x<right.x+right.width&&left.x+left.width>right.x&&left.y<right.y+right.height&&left.y+left.height>right.y;
 const blocksBarracks=(rect:Rect)=>infantry.state().buildings.some(building=>Math.abs(building.x-(rect.x+rect.width/2))<2+rect.width/2&&Math.abs(building.y-(rect.y+rect.height/2))<2+rect.height/2);
 const towerPlacement=(point:Vec2):Vec2=>state.selectedKind==='crusher'?point:resolvePlacement(map,point,1.25,towerMounts());
 const burst=(point:Vec2, count:number, color:[number,number,number], speed:number, life:number, gravity=0, style:VisualParticleStyle='spark', scale=1)=>{
   // Keep the CPU-side flourish bounded: the swarm itself stays entirely GPU simulated.
   const available=Math.max(0,520-visualParticles.length);
   for(let i=0;i<Math.min(count,available);i++){
     const angle=(i/count)*Math.PI*2+Math.sin((simulatedTime+i)*9)*.32;
     const velocity=speed*(.45+((i*37)%100)/100*.7);
     visualParticles.push({x:point.x,y:point.y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,size:(.2+((i*17)%100)/100*.38)*scale,life:life*(.65+((i*29)%100)/100*.45),age:0,color,gravity,drag:style==='smoke'?.55:.32,style,spin:(i%2?1:-1)*(2.4+((i*13)%10)*.35)});
   }
 };
 const spray=(point:Vec2,count:number,color:[number,number,number],speed:number,life:number,direction:Vec2,gravity:number,style:VisualParticleStyle,scale=1)=>{
   const available=Math.max(0,520-visualParticles.length),back=Math.atan2(-direction.y,-direction.x);
   for(let i=0;i<Math.min(count,available);i++){
     const offset=((i/Math.max(1,count-1))-.5)*2.25+Math.sin((i+1)*17.13)*.18,angle=back+offset,velocity=speed*(.5+((i*41)%100)/100*.72);
     visualParticles.push({x:point.x,y:point.y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,size:(.22+((i*19)%100)/100*.42)*scale,life:life*(.72+((i*23)%100)/100*.4),age:0,color,gravity,drag:style==='smoke'?.55:.3,style,spin:(i%2?1:-1)*(3.2+((i*11)%9)*.48)});
   }
 };
 const showPressure=(point:Vec2,kpa:number,serial=0)=>{
   const element=document.createElement('output');element.className=`pressure-popup${kpa>=1000?' is-mpa':''}`;element.textContent=formatPressure(kpa);pressureLayer.append(element);
   pressurePopups.push({element,x:point.x,y:point.y,age:0,life:.72,drift:((serial*37)%17-8)*1.15});
   if(pressurePopups.length>32){pressurePopups.shift()!.element.remove();}
 };
 const detonateHeavy=(impact:HeavyImpact)=>{
   const rocket=impact.kind==='rocket',scale=rocket ? .88 : 1;
   heavyExplosions.push({x:impact.x,y:impact.y,kind:impact.kind,age:0,life:rocket ? 1.35 : 1.65,scale,direction:impact.direction,serial:impact.serial});
   if(heavyExplosions.length>32)heavyExplosions.splice(0,heavyExplosions.length-32);
   setCombatAudioGain();audio.explode(impact.kind,impact.x,impact.serial);
   burst(impact,rocket?7:9,[.25,.24,.22],rocket?3.8:4.6,1.05,-.45,'smoke',rocket ? .9 : 1.15);
   burst(impact,rocket?8:12,[.39,.27,.14],rocket?9:10.5,.68,7.4,'debris',rocket ? .9 : 1.12);
   spray(impact,rocket?7:10,[1,.64,.13],rocket?12:14,.38,impact.direction,1.8,'spark',rocket ? .8 : 1);
   burst(impact,rocket?3:4,[1,.27,.035],rocket?6.5:7.5,.48,-1.2,'spark',rocket?1:1.15);
   cameraShake=Math.min(1.4,Math.max(cameraShake,rocket ? .62 : .86)+.12);
   showPressure(impact,impact.peakPressureKpa,impact.serial);
   damageBarriersFromExplosion(impact,impact.radius);
   commands.push({...impact,kind:'corpse-blast',radius:impact.radius,strength:0,damage:0,direction:{x:0,y:0},cone:0,duration:0,source:0});
 };
 const detonateInfantryRocket=(projectile:InfantryRocketProjectile)=>{
   infantryRocketExplosions.push({x:projectile.target.x,y:projectile.target.y,age:0,life:.65,serial:projectile.serial});
   if(infantryRocketExplosions.length>48)infantryRocketExplosions.splice(0,infantryRocketExplosions.length-48);
   burst(projectile.target,5,[.2,.2,.18],3.4,.72,-.35,'smoke',.75);
   spray(projectile.target,6,[1,.42,.06],7,.28,{x:projectile.target.x-projectile.x,y:projectile.target.y-projectile.y},1.2,'spark',.65);
   damageBarriersFromExplosion(projectile.target,3.2);
   commands.push({...projectile.target,kind:'corpse-blast',radius:3.2,strength:0,damage:0,direction:{x:0,y:0},cone:0,duration:0,source:0});
 };
 const shotReader=new ShotEventReader(gpu.device,events=>{
   for(const event of events){
     const tower=run.model.towers.find(candidate=>candidate.id===event.towerId);if(!tower)continue;
     tower.angle=(event.angle+Math.PI*2)%(Math.PI*2);
     const shotDefinition=compileTower(tower,run.model.bonuses,run.model.commandUpgrades,run.statModifiers());
     setCombatAudioGain();audio.fire(tower.kind,tower.x,event.serial);
     if(tower.kind==='tesla'&&shotDefinition.overload&&event.serial%6===0){
       burst(tower,32,[.75,.5,1],12,.55,-1,'spark',1.2);cameraShake=Math.max(cameraShake,.28);state.message='TESLA OVERLOAD — CHAIN CASCADE';
     }
     if(tower.kind==='mortar'||tower.kind==='rocket'){
       heavyProjectiles.push(...createHeavyProjectiles(tower.kind,turretMuzzlePoints(tower.kind,tower,event.angle),event.target,event.serial,shotDefinition.peakPressureKpa,shotDefinition.radius,event.angle).map(projectile=>({...projectile,launchTick:event.launchTick})));
       continue;
     }
     if(simulatedTime-(lastTowerPressurePopup.get(tower.id)??-1)>=.36){showPressure(event.target,shotDefinition.peakPressureKpa,event.serial);lastTowerPressurePopup.set(tower.id,simulatedTime);}
     if(tower.kind!=='autocannon'&&tower.kind!=='railgun')continue;
     const forward={x:Math.cos(event.angle),y:Math.sin(event.angle)},speed=tower.kind==='railgun'?7.2:5.4,heavy=tower.kind==='railgun';
     const muzzle=turretMuzzlePoint(tower.kind,tower,event.angle);
     const ejection=turretEjection(tower.kind,tower,event.angle),jitter=((event.serial*37)%11-5)*.035;
     if(ejection&&visualParticles.length<520)visualParticles.push({x:ejection.point.x,y:ejection.point.y,vx:ejection.direction.x*speed+forward.x*jitter,vy:ejection.direction.y*speed+forward.y*jitter,size:heavy ? .42 : .3,life:heavy ? .92 : .72,age:0,color:heavy?[.78,.57,.24]:[.9,.7,.27],gravity:7.5,drag:.42,style:'shell',spin:(event.serial%2?1:-1)*(heavy?12:18)});
     setCombatAudioGain();audio.shell(tower.x,event.serial,heavy);
     burst(event.target,heavy?10:6,heavy?[.46,1,.82]:[1,.7,.18],heavy?10:7,heavy ? .32 : .22,2,'spark',heavy?1.2:.8);
     burst(muzzle,2,[.24,.22,.18],2.2,.52,-.7,'smoke',heavy?1.15:.8);
   }
 },error=>errors.push(`shot readback: ${String(error)}`));
 const placeWall=(wall:Rect)=>{if(infantry.state().buildings.some(b=>Math.abs(b.x-(wall.x+2))<4&&Math.abs(b.y-(wall.y+2))<4)){state.message='Keep the barracks foundation clear.';return;}const existing=builtWalls.find(candidate=>candidate.x===wall.x&&candidate.y===wall.y);if(existing){if(existing.health>=existing.maxHealth){state.message='Metal wall is already at full integrity.';return;}const result=run.spendMetal(METAL_WALL_COST);if(!result.ok){state.message=result.reason??'Could not reinforce wall.';return;}existing.health=existing.maxHealth;state.message='Metal wall reinforced to full integrity.';return;}const capacity=wallCapacity(0),builtWall={...wall,health:capacity,maxHealth:capacity};const issue=previewStructure(map,run.model.towers,builtWall);if(issue){state.message=issue;return;}const result=run.spendMetal(METAL_WALL_COST);if(!result.ok){state.message=result.reason??'Could not build wall.';return;}builtWalls.push(builtWall);map={...map,obstacles:[...map.obstacles,builtWall]};run.setMap(map);syncTowerMounts();refreshNavigation();state.message='Metal wall installed. Link wall sections to add shared turret hardpoints.';};
 const barrierPlan=(kind:BarrierKind,rawPoints:readonly Vec2[])=>{
   const fenceTargets=kind==='fence'?[...new Map(builtFences.map(section=>[section.run,section])).values()].flatMap(section=>{const run=builtFences.filter(candidate=>candidate.run===section.run);return [run[0].from,run.at(-1)!.to];}):[];
   const points=kind==='fence'?snapBarrierEndpoints(rawPoints,fenceTargets):rawPoints;
   const length=barrierLength(points),sections=barrierSegments(kind,nextBarrierRun,points),unitCost=kind==='fence'?CHAINLINK_FENCE_COST:45,cost=barrierCost(length,unitCost);
   const baseObstacles=map.obstacles.filter(obstacle=>!builtFences.some(section=>sameRect(obstacle,section)));
   const conflict=sections.some(section=>infantry.state().buildings.some(building=>barrierRectDistance(section,{x:building.x-2,y:building.y-2,width:4,height:4})<.36)||(kind==='fence'&&builtWires.some(wire=>barrierPlacementConflict(section,wire)))||builtFences.some(fence=>barrierPlacementConflict(section,fence))||baseObstacles.some(obstacle=>barrierRectDistance(section,obstacle)<.36)||run.model.towers.some(tower=>pointToBarrierDistance(tower,section)<2));
   const mapIssue=kind==='fence'&&!conflict?validateEditorMap(map,sections):undefined;
   const ended=run.model.phase==='won'||run.model.phase==='lost',valid=length>=MIN_BARRIER_LENGTH&&!!sections.length&&!conflict&&!mapIssue&&!ended&&run.model.metal>=cost;
   const reason=length<MIN_BARRIER_LENGTH?'Drag farther to place a barrier.':conflict?'Barrier paths must stay clear of walls, the other barrier type, barracks, and towers.':mapIssue??(ended?'Barriers cannot be placed after the run ends.':run.model.metal<cost?`Need ${cost} Metal for this ${kind==='fence'?'fence':'wire'} run.`:'');
   return {sections,cost,valid,reason,points};
 };
 const placeBarrier=(kind:BarrierKind,rawPoints:readonly Vec2[])=>{
   const points=kind==='fence'?[rawPoints[0],rawPoints.at(-1)!]:simplifyBarrier(rawPoints),plan=barrierPlan(kind,points);if(!plan.valid){state.message=plan.reason;return;}
   const result=run.spendMetal(plan.cost);if(!result.ok){state.message=result.reason??'Could not install barrier.';return;}
   const durability=kind==='fence'?BASE_FENCE_DURABILITY:barbedWireStats(run.model.commandUpgrades).durability,runId=nextBarrierRun++;
   if(kind==='fence'){const sections=plan.sections.map(section=>({...section,run:runId,health:durability,maxHealth:durability}));builtFences.push(...sections);map={...map,obstacles:[...map.obstacles,...sections]};run.setMap(map);syncTowerMounts();refreshNavigation();}
   else builtWires.push(...plan.sections.map(section=>({...section,run:runId,health:durability,maxHealth:durability,breached:false})));
   state.message=`${kind==='fence'?'Chain-link':'Barbed-wire'} ${kind==='fence'?'section':'path'} installed for ${plan.cost} Metal.`;
 };
 const nearestBarrier=(segments:readonly BarrierSegment[],point:Vec2)=>segments.map(segment=>({segment,distance:pointToBarrierDistance(point,segment)})).filter(candidate=>candidate.distance<=1.3).sort((a,b)=>a.distance-b.distance)[0]?.segment;
 const demolishAt=(point:Vec2)=>{const wall=builtWalls.find(candidate=>point.x>=candidate.x&&point.x<candidate.x+candidate.width&&point.y>=candidate.y&&point.y<candidate.y+candidate.height);if(wall){removeWall(point);return;}if(nearestBarrier(builtFences,point)){removeFence(point);return;}if(nearestBarrier(builtWires,point)){removeWire(point);return;}state.message='Only player-built Metal Walls, Chain-link Fences, and Barbed Wire can be demolished.';};
 ui.canvas.addEventListener('pointermove',event=>{
   pointer=renderer.screenToWorld(event.clientX,event.clientY);
   if(infantryDrag&&(event.buttons&1))infantryDrag.current=pointer;
   if(state.upgradeMode){const tower=run.model.towers.find(candidate=>Math.hypot(candidate.x-pointer!.x,candidate.y-pointer!.y)<TURRET_HIT_RADIUS);if(tower)setUpgradeTarget(tower.id);else if(hoveredTowerId!==null)scheduleUpgradeTargetClear();}
   if(barrierDrag&&(event.buttons&1))barrierDrag.points=barrierDrag.kind==='wire'?sampleBarrier(barrierDrag.points,pointer):[barrierDrag.points[0],pointer];
   if(editor.active&&event.buttons)editor.paint(pointer,event.buttons&2?true:undefined);if((state.buildTool==='wall'||state.buildTool==='fence'||state.buildTool==='wire')&&(event.buttons&2))(state.buildTool==='wall'?removeWall:state.buildTool==='fence'?removeFence:removeWire)(pointer);if(state.buildTool==='wall'&&(event.buttons&1))placeWall(wallAt(pointer));
 });
 const removeWall=(point:Vec2)=>{const index=builtWalls.findIndex(w=>point.x>=w.x&&point.x<w.x+w.width&&point.y>=w.y&&point.y<w.y+w.height);if(index<0)return;const wall=builtWalls[index];if(run.model.towers.some(tower=>tower.x>=wall.x&&tower.x<wall.x+wall.width&&tower.y>=wall.y&&tower.y<wall.y+wall.height)){state.message='Sell the mounted turret before removing this wall.';return;}builtWalls.splice(index,1);removeStructuresFromMap([wall]);run.refundMetal(Math.floor(METAL_WALL_COST/2));state.message=`Metal wall recovered for ${Math.floor(METAL_WALL_COST/2)} Metal.`;};
 const removeFence=(point:Vec2)=>{const hit=nearestBarrier(builtFences,point);if(!hit)return;const removed=builtFences.filter(section=>section.run===hit.run);builtFences=builtFences.filter(section=>section.run!==hit.run);removeStructuresFromMap(removed);run.setMap(map);syncTowerMounts();refreshNavigation();const refund=Math.floor(barrierCost(removed.reduce((sum,segment)=>sum+Math.hypot(segment.to.x-segment.from.x,segment.to.y-segment.from.y),0),CHAINLINK_FENCE_COST)/2);run.refundMetal(refund);state.message=`Chain-link section recycled for ${refund} Metal.`;};
 const removeWire=(point:Vec2)=>{const hit=nearestBarrier(builtWires,point);if(!hit)return;const removed=builtWires.filter(section=>section.run===hit.run);builtWires=builtWires.filter(section=>section.run!==hit.run);const refund=Math.floor(barrierCost(removed.reduce((sum,segment)=>sum+Math.hypot(segment.to.x-segment.from.x,segment.to.y-segment.from.y),0),45)/2);run.refundMetal(refund);state.message=`Barbed-wire path recycled for ${refund} Metal.`;};
 ui.canvas.addEventListener('wheel',event=>{
   if(editor.active)return;event.preventDefault();
   // Trackpads emit many tiny deltas; scale by distance instead of taking a
   // full zoom step per event. Normalize mouse-wheel line/page units too.
   const unit=event.deltaMode===1?16:event.deltaMode===2?ui.canvas.clientHeight:1;
   const delta=Math.max(-100,Math.min(100,event.deltaY*unit));
   renderer.zoomAt(Math.exp(-delta*.001),event.clientX,event.clientY);
 },{passive:false});
 ui.canvas.addEventListener('contextmenu',event=>{if(editor.active||state.buildTool||infantry.selectedSoldiers.size)event.preventDefault();});
 ui.canvas.addEventListener('pointerleave',()=>{pointer=undefined;if(state.upgradeMode)scheduleUpgradeTargetClear();});
 ui.canvas.addEventListener('pointerdown',event=>{
   audio.arm();if(failed)return;const point=renderer.screenToWorld(event.clientX,event.clientY);
   wallInspector.select(undefined);
   if(editor.active){editor.paint(point,event.button===2?true:undefined);return;}
   if(state.mode==='game'){
     const neutral=!state.buildTool&&!state.selectedKind&&!state.upgradeMode&&!state.moveMode&&!state.targetMode&&!infantry.tool;
     if(event.button===2&&neutral&&infantry.command(point)){event.preventDefault();run.model.selected=null;return;}
     if(event.button===0&&neutral){infantryDrag={start:point,current:point,clientX:event.clientX,clientY:event.clientY,additive:event.shiftKey};if(event.isTrusted)ui.canvas.setPointerCapture(event.pointerId);}
     if(state.targetMode&&targetingTowerId!==null){const tower=run.model.towers.find(candidate=>candidate.id===targetingTowerId),result=run.setGroundTarget(targetingTowerId,point);if(result.ok){targetingTowerId=null;state.targetMode=false;}actionResult(result,tower?`${TOWERS[tower.kind].name} focused on the marked ground.`:'Ground target set.');return;}
     if(event.button===0&&infantry.click(point,!state.buildTool&&!state.selectedKind&&!state.upgradeMode&&!state.moveMode&&!state.targetMode,event.shiftKey)){run.model.selected=null;return;}
     if(state.buildTool==='wall'){if(event.button===2)removeWall(point);else placeWall(wallAt(point));return;}
     if(state.buildTool==='fence'||state.buildTool==='wire'){if(event.button===2){(state.buildTool==='fence'?removeFence:removeWire)(point);return;}if(event.button===0){barrierDrag={kind:state.buildTool,points:[point],pointerId:event.pointerId};if(event.isTrusted)ui.canvas.setPointerCapture(event.pointerId);return;}}
     if(state.buildTool==='demolish'){demolishAt(point);return;}
     if(state.moveMode&&movingTowerId!==null){const tower=run.model.towers.find(candidate=>candidate.id===movingTowerId),result=run.move(movingTowerId,towerPlacement(point));if(result.ok){movingTowerId=null;state.moveMode=false;refreshNavigation();combat.resetAttribution();run.resetTowerAttribution();}actionResult(result,tower?`${TOWERS[tower.kind].name} moved for ${TOWER_MOVE_COST} Metal.`:'Tower moved.');}
     else if(state.selectedKind){const result=run.place(state.selectedKind,towerPlacement(point));if(result.ok){refreshNavigation();combat.resetAttribution();run.resetTowerAttribution();}actionResult(result,result.tower?`${TOWERS[result.tower.kind].name} deployed.`:'Tower deployed.');}
     else{
       const clicked=run.model.towers.find(t=>t.kind==='crusher'?Math.abs(t.x-point.x)<=4&&Math.abs(t.y-point.y)<=6:Math.hypot(t.x-point.x,t.y-point.y)<TURRET_HIT_RADIUS);
       if(state.upgradeMode){setUpgradeTarget(clicked?.id??null);return;}
       run.model.selected=clicked?.id??null;targetingTowerId=null;state.targetMode=false;
       if(!clicked)wallInspector.select(builtWalls.find(w=>point.x>=w.x&&point.x<=w.x+w.width&&point.y>=w.y&&point.y<=w.y+w.height));
     }
   }else if(state.tool!=='inspect'){
     if(commands.length>=64){state.message='Effect queue full; advance the simulation.';return;}
     const peakPressureKpa=state.tool==='blast'?MANUAL_BLAST_PEAK_KPA:MANUAL_PUSH_PEAK_KPA,effect:Effect={...point,kind:state.tool==='blast'?'blast':'push',radius:state.tool==='blast'?10:15,strength:state.tool==='blast'?32:38,damage:state.tool==='blast'?16:0,direction:{x:1,y:0},cone:Math.PI*.7,duration:.55,source:0,peakPressureKpa};commands.push(effect);visuals.push({...effect});showPressure(point,peakPressureKpa,clock.tick);
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
 ui.canvas.addEventListener('pointerup',event=>{if(barrierDrag&&event.pointerId===barrierDrag.pointerId&&event.button===0){const drag=barrierDrag;barrierDrag=undefined;placeBarrier(drag.kind,drag.points);return;}if(!infantryDrag||event.button!==0)return;const drag=infantryDrag;infantryDrag=undefined;if(Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)>5){infantry.selectBox(drag.start,drag.current,drag.additive);run.model.selected=null;}});
 const coop=mountCoop(ui.canvas,{
   screenToWorld:(x,y)=>renderer.screenToWorld(x,y),
   snapshot:()=>({ui:state,infantry:infantry.snapshot()}),
   status:()=>`Metal ${run.model.metal} · Integrity ${Math.round(run.model.baseHealth)}% · Wave ${run.model.wave} · ${run.model.phase}${state.paused?' · PAUSED':''}\n${state.message}`,
   command:(command,point)=>{
     if(failed||editor.active||state.mode!=='game')return;
     if(command.type==='action'){handleAction(command.action as GameAction);}
     else if(command.type==='infantry'){const target=root.querySelector<HTMLButtonElement>(`[data-infantry="${command.action}"]${command.kind?`[data-kind="${command.kind}"]`:''}`);target?.click();}
     else if(command.type==='key'){window.dispatchEvent(new KeyboardEvent('keydown',{key:command.key,bubbles:true}));}
     else if(command.type==='pan'){renderer.pan(command.dx,command.dy);}
     else if(command.type==='zoom'&&point){const screen=renderer.worldToScreen(point.x,point.y);renderer.zoomAt(command.factor,screen.x,screen.y);}
     else if(command.type==='pointer'&&point){const screen=renderer.worldToScreen(point.x,point.y);ui.canvas.dispatchEvent(new PointerEvent(command.phase,{clientX:screen.x,clientY:screen.y,button:command.button,buttons:command.buttons,shiftKey:command.shiftKey,pointerId:9001,bubbles:true}));}
     else if(command.type==='place'&&point&&command.kind){
       const position=command.kind==='crusher'?point:resolvePlacement(map,point,1.25,towerMounts());
       const result=run.place(command.kind,position);
       if(result.ok){refreshNavigation();combat.resetAttribution();run.resetTowerAttribution();}
       actionResult(result,result.tower?`Partner deployed ${TOWERS[result.tower.kind].name}.`:'Partner deployed a tower.');
     }else if(['start-wave','pause','slam-gates','dam-north','dam-south','dam-flood'].includes(command.type))handleAction({type:command.type} as GameAction);
   }
  });
 const panKeys=new Set<string>();
 let panFast=false;
 window.addEventListener('keydown',event=>{
   audio.arm();
   if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
   const target=event.target;
   if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select')))return;
   panFast=event.shiftKey;
   if(event.code==='Space'&&target instanceof HTMLElement&&target.closest('button,a[href],[role=button]'))return;
   const key=event.key.toLowerCase();
   if(['w','a','s','d'].includes(key)){event.preventDefault();panKeys.add(key);return;}
   if(event.repeat&&[' ','q','e','r','u','h','escape','1','2','3','4','5','6','7','8','9','g','f'].includes(key)){event.preventDefault();return;}
   const towerIndex=Number(key)-1;
   if(Number.isInteger(towerIndex)&&towerIndex>=0&&towerIndex<Object.keys(TOWERS).length){
     event.preventDefault();handleAction({type:'select-tower',kind:Object.keys(TOWERS)[towerIndex] as keyof typeof TOWERS});return;
   }
   if(key==='f'&&map.dam){event.preventDefault();handleAction({type:'dam-flood'});return;}
   if(key==='g'){event.preventDefault();handleAction({type:'slam-gates'});return;}
   if(key==='q'||key==='e'){
     event.preventDefault();
     if(state.upgradeMode){if(hoveredTowerId!==null)handleAction({type:'upgrade-tower',id:hoveredTowerId,branch:key==='q'?0:1});else state.message='Hover a tower before choosing its upgrade.';return;}
     handleAction({type:key==='q'?'wall-tool':'wire-tool'});return;
   }
   if(key==='f'){event.preventDefault();handleAction({type:'fence-tool'});return;}
   if(key==='r'){event.preventDefault();handleAction({type:'demolish-tool'});return;}
   if(key==='u'){event.preventDefault();handleAction({type:'upgrade-tool'});return;}
   if(event.code==='Space'){
     event.preventDefault();handleAction(state.mode==='game'&&run.model.phase==='preparation'?{type:'start-wave'}:{type:'pause'});
   }
   if(event.key==='Escape'){
     infantry.cancel();
     event.preventDefault();state.selectedKind=null;state.buildTool=null;state.upgradeMode=false;state.moveMode=false;state.targetMode=false;movingTowerId=null;targetingTowerId=null;run.model.selected=null;state.message='Placement cancelled.';
   }
   if(key==='h')handleAction({type:'heatmap',value:!state.heatmap});
   if(key==='+'||key==='=')renderer.zoomAt(1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);
   if(key==='-')renderer.zoomAt(1/1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);
 });
 window.addEventListener('keyup',event=>{panKeys.delete(event.key.toLowerCase());panFast=event.shiftKey;});
 window.addEventListener('blur',()=>{panKeys.clear();panFast=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){panKeys.clear();panFast=false;}});
 document.addEventListener('focusin',event=>{const target=event.target;if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select'))){panKeys.clear();panFast=false;}});
 function updateUI(now:number){
   wallInspector.update(now,builtWalls);
   infantry.update();
   state.casualties=state.mode==='game'?(infantry.state().casualties??0):0;state.friendlyFire=state.mode==='game'?(infantry.state().friendlyFire??0):0;
   const report=metrics.report();state.fps=report.fps;state.frameMs=report.medianMs;
   if(map.dam&&['preparation','checkpoint'].includes(run.model.phase)){map.dam.surge=0;map.dam.switchCooldown=0;}
   state.dam=map.dam;
   const gates=run.model.towers.filter(t=>t.kind==='crusher');state.crushers={total:gates.length,ready:gates.filter(t=>t.cooldown<=0).length,next:gates.length?Math.min(...gates.map(t=>t.cooldown)):0};
   state.metal=run.model.metal;state.baseHealth=run.model.baseHealth/20*100;state.level=run.model.level;state.wave=run.model.wave;state.waveCount=run.model.waveCount;state.phase=state.mode==='lab'?'combat':run.model.phase;
   state.mapId=map.id;state.mapTitle=map.scenery?.title;state.mapBriefing=map.scenery?.briefing;const nextLevel=Math.floor(run.model.wave/10)+1;state.nextMapTitle=isCampaignMap(map)&&nextLevel!==run.model.level&&nextLevel<=3?campaignMap(nextLevel).scenery!.title:undefined;
   state.selected=run.model.towers.find(t=>t.id===run.model.selected)??null;state.upgradeTarget=state.upgradeMode&&hoveredTowerId!==null?run.model.towers.find(t=>t.id===hoveredTowerId)??null:null;state.bonusChoices=state.mode==='game'?run.model.bonusChoices:[];state.bonuses=state.mode==='game'?run.model.bonuses:[];
   state.boss=latest.boss;state.bossHealth=latest.boss?.active?latest.boss.health/latest.boss.maxHealth*100:undefined;state.commandUpgrades=state.mode==='game'?run.model.commandUpgrades:[];state.statUpgrades=run.statUpgrades();state.towerUnlocks=run.towerUnlocks();
   state.waveProgress=run.waveProgress;
   ui.update(state);positionInspector();positionUpgradeInspector();positionInfantryInspector();if(now-lastAutosave>1500){saveSession();lastAutosave=now;}lastUI=now;
   // Sorting timing windows is diagnostic work: do it at 1 Hz, not every UI update.
   if(profiler&&now-lastProfileReport>=1000){profileSnapshot={cpuProfile:cpuProfile?.report(),gpuProfile:profiler.report()};lastProfileReport=now;}
   diagnosticText.textContent=JSON.stringify({adapter:gpu.adapter,abi:'passed',dam:map.dam,wave:run.model.wave,waveProgress:run.waveProgress,epoch,tick:clock.tick,simulationSeconds:simulatedTime,simulationSpeed:state.simulationSpeed??1,paused:state.paused,simulationSecondsPerWallSecond:simulationRate.report(),slots:count,live:latest.live,requested:requestedPopulation,invalid:latest.invalid,peakPacking:latest.maxPacking,crushKills:latest.crushKills,kills:latest.kills,medianMs:report.medianMs,p95Ms:report.p95Ms,frameSamples:report.samples,canvas:[ui.canvas.width,ui.canvas.height],graphics:{mode:graphics.mode,scale:graphics.scale},solver:params.get('solver')==='hybrid'?'hybrid':'exact',readbackErrors:errors,boss:latest.boss,...profileSnapshot},null,2);
 }
 function positionInfantryInspector(){
   const b=infantry.state().buildings.find(b=>b.id===infantry.selected),panel=infantry.inspector;
   if(!b||panel.hidden||panel.dataset.windowMoved)return;
   const point=renderer.worldToScreen(b.x,b.y),arena=ui.canvas.parentElement!.getBoundingClientRect(),w=panel.offsetWidth||310,h=panel.offsetHeight||400;
   const x=point.x-arena.left+24;
   panel.style.left=Math.max(12,Math.min(arena.width-w-12,x+w<arena.width?x:x-w-48))+'px';
   panel.style.top=Math.max(12,Math.min(arena.height-h-12,point.y-arena.top-h/2))+'px';
 }
 function positionInspector(){
   selectedInspector.classList.toggle('has-selection',!!state.selected);
   if(!state.selected||selectedInspector.dataset.windowMoved)return;
   const point=renderer.worldToScreen(state.selected.x,state.selected.y),arena=ui.canvas.parentElement!.getBoundingClientRect(),width=selectedInspector.offsetWidth||300,height=selectedInspector.offsetHeight||280,gap=18,anchorX=point.x-arena.left;
   const preferredLeft=anchorX+gap,left=preferredLeft+width<=arena.width-12?preferredLeft:anchorX-width-gap;
   selectedInspector.style.left=`${Math.max(12,Math.min(arena.width-width-12,left))}px`;
   selectedInspector.style.top=`${Math.max(12,Math.min(arena.height-height-12,point.y-arena.top-height/2))}px`;
 }
 function positionUpgradeInspector(){
   if(!state.upgradeMode||!state.upgradeTarget||upgradeInspector.dataset.windowMoved)return;
   const point=renderer.worldToScreen(state.upgradeTarget.x,state.upgradeTarget.y),arena=ui.canvas.parentElement!.getBoundingClientRect(),width=upgradeInspector.offsetWidth||250,height=upgradeInspector.offsetHeight||190,gap=20,anchorX=point.x-arena.left;
   const preferredLeft=anchorX+gap,left=preferredLeft+width<=arena.width-12?preferredLeft:anchorX-width-gap;
   upgradeInspector.style.left=`${Math.max(12,Math.min(arena.width-width-12,left))}px`;
   upgradeInspector.style.top=`${Math.max(12,Math.min(arena.height-height-12,point.y-arena.top-height/2))}px`;
 }
 function tick(){
   clock.tick++;simulatedTime+=clock.step;run.advanceCrushers(clock.step);
   let arrivals:Float32Array=new Float32Array(0);
   if(state.mode==='game'&&enemiesActive()){
     const positions=hordeFront.advance(clock.step,map,(run.model.level-1)*10+run.model.wave,state.difficulty,run.model.pending,run.spawnPressure);
     const capacity=latest.inletBlocked?0:Math.min(positions.length,hordeCapacity.available(gpu.shared.capacity));
     const batches=run.takeSpawns(capacity,clock.step);
     arrivals=encodeHorde(batches,positions,map.goal);
     const added=arrivals.length/PARTICLE_FLOATS;
     hordeCapacity.add(clock.tick,added);count=Math.max(count,gpu.shared.capacity-hordeCapacity.available(gpu.shared.capacity));spawnSlot+=added;state.population+=added;
   }
   const wireStats=barbedWireStats(run.model.commandUpgrades),activeWires=builtWires.filter(wire=>!wire.breached);
   const floodEffects=advanceDam(map,clock.step,enemiesActive());
   const currentEffects=advanceCurrents(map,clock.step,simulatedTime,enemiesActive());
   const effects=[...floodEffects,...currentEffects,...activeWires.map(wire=>({x:wire.x+wire.width/2,y:wire.y+wire.height/2,kind:'slow' as const,radius:3.2,strength:.55,damage:wireStats.damage*clock.step,direction:{x:0,y:0},cone:0,duration:wireStats.slow,source:0})),...commands].slice(0,64);commands=[];
   if(state.mode==='game'&&enemiesActive()&&(builtWalls.length||builtFences.length||builtWires.length)){
     const obstacleSnapshot=map.obstacles,telemetry=(segment:Rect)=>{const index=obstacleSnapshot.indexOf(segment);return index<0?{contact:0,packing:0,pressure:0}:{contact:Math.min(1,(latest.obstacleContacts?.[index]??0)/6),packing:latest.obstaclePacking?.[index]??0,pressure:latest.obstaclePressure?.[index]??0};};
     const wallLevel=techRank(run.model.commandUpgrades,'structure-armor');
     const collapsed=builtWalls.filter(wall=>{const sample=telemetry(wall);wall.health=wallHealthAfterPressure(wall.health,sample.pressure,sample.contact,clock.step,wallLevel);return wall.health<=0;});
     const fallenFences=builtFences.filter(fence=>{const sample=telemetry(fence);fence.health=fenceHealthAfterPressure(fence.health,sample.pressure,sample.contact,clock.step);return fence.health<=0;});
     const breached=builtWires.filter(wire=>{if(wire.breached)return false;const sample=telemetry(wire);wire.health-=clock.step*wireStats.wear*sample.contact*(1+Math.max(0,sample.packing-1)*.4);if(sample.contact>0&&sample.packing>=wireStats.resistance){wire.breached=true;return true;}return false;});
     for(const wire of builtWires)if(wire.breached)wire.health-=wire.maxHealth*clock.step*.45;
     const spent=builtWires.filter(wire=>wire.health<=0);
     if(collapsed.length||fallenFences.length||breached.length||spent.length){
       for(const wall of collapsed)burst({x:wall.x+wall.width/2,y:wall.y+wall.height/2},30,[.48,.54,.6],8,1.1,10,'debris',1.6);
       for(const fence of fallenFences){const center={x:fence.x+fence.width/2,y:fence.y+fence.height/2};burst(center,26,[.42,.5,.49],10,1.2,9,'debris',1.15);burst(center,8,[.7,.73,.62],7,.7,4,'spark',.65);}
       for(const wire of breached){const center={x:wire.x+wire.width/2,y:wire.y+wire.height/2};burst(center,24,[1,.32,.08],14,.75,10,'spark',1.15);burst(center,22,[.5,.6,.62],9,1.05,9,'debris',1.45);burst(center,7,[.2,.19,.16],4,1.25,-2,'smoke',2.2);}
       for(const wire of spent)if(!breached.includes(wire))burst({x:wire.x+wire.width/2,y:wire.y+wire.height/2},22,[.56,.42,.22],8,.9,9,'debris',1.3);
       builtWalls=builtWalls.filter(wall=>!collapsed.includes(wall));builtFences=builtFences.filter(fence=>!fallenFences.includes(fence));builtWires=builtWires.filter(wire=>!spent.includes(wire));
       removeStructuresFromMap([...collapsed,...fallenFences,...breached,...spent]);
       state.message=collapsed.length?`${collapsed.length} Metal wall section${collapsed.length===1?'':'s'} collapsed under local pressure.`:fallenFences.length?`${fallenFences.length} Chain-link Fence section${fallenFences.length===1?'':'s'} folded under swarm pressure.`:breached.length?`${breached.length} barbed wire section${breached.length===1?'':'s'} gave way under local swarm pressure.`:`${spent.length} barbed wire section${spent.length===1?'':'s'} wore out.`;
     }
   }
   const activeMap=combatMap();
   const transparentSightObstacles=[...builtWires,...builtFences,...turretObstacles(run.model.towers)];
   const infantrySightMap={...activeMap,obstacles:activeMap.obstacles.filter(obstacle=>!transparentSightObstacles.some(transparent=>sameRect(obstacle,transparent)))};
   const statModifiers=run.statModifiers(),researchModifiers=run.researchModifiers();
   const frame:CombatFrame={dt:clock.step,tick:clock.tick,count,map:activeMap,sightObstacles:firingObstacles(activeMap.obstacles,builtFences),effects,tuning:DEFAULT_TUNING,navigation,lab:state.mode==='lab',towers:state.mode==='game'?run.model.towers.map(tower=>({tower,definition:cachedTower(tower,run.model.bonuses,run.model.commandUpgrades,statModifiers)})):[]};
   const nativeEncoder=gpu.device.createCommandEncoder({label:`Simulation tick ${clock.tick}`}),measurement=profiler?.wrap(nativeEncoder),encoder=measurement?.encoder??nativeEncoder;
   const bossFrame={dt:clock.step,tick:clock.tick,count,map:activeMap.scenery?activeMap:{...activeMap,spawn:{x:50,y:35,width:32,height:30}},active:state.mode==='game'&&run.isBossWave};
   horde.encode(encoder,arrivals,count);
   const infantryShots=advanceInfantry(infantry.state(),infantry.ensureFields(),infantry.fields,infantryGPU.threats,clock.step,state.mode==='game'&&enemiesActive(),researchModifiers,infantry.orderFields);
   const finishInfantry=state.mode==='game'?infantryGPU.encode(encoder,infantry.state().soldiers,infantryShots,activeMap,count,clock.tick%6===0,researchModifiers,clock.step,infantrySightMap):undefined;
   if(infantryShots.length){for(const shot of infantryShots){const soldier=infantry.state().soldiers.find(s=>s.id===shot.soldier),kind=soldier?.kind;if(kind==='rocket'&&soldier){const muzzle=infantryMuzzle(soldier);infantryRocketProjectiles.push({x:muzzle.x,y:muzzle.y,target:{x:shot.x,y:shot.y},age:0,life:.26,serial:clock.tick*1000+shot.soldier});}setCombatAudioGain();if(kind==='dog')audio.bark(shot.x,clock.tick);else if(kind==='samurai')audio.slash(shot.x,clock.tick);else audio.infantryFire(kind==='rocket'?'rocket':kind==='flame'?'flame':'rifle',shot.x,clock.tick);}}
   combat.encodeBefore(encoder,frame);boss.encode(encoder,bossFrame);physics.encode(encoder,frame);combat.encodeAfter(encoder,frame);boss.encodeResolve(encoder,bossFrame);
   let finish:(()=>void)|undefined,finishShots:(()=>void)|undefined;
   if(clock.tick-lastTickSample>=6){finish=settlement.encode(encoder,gpu.shared.counters,gpu.shared.obstacleCounters!,gpu.shared.obstacleCapacity!,epoch,clock.tick);if(finish)lastTickSample=clock.tick;}
   if(clock.tick%3===0)finishShots=shotReader.encode(encoder,combat.shotState,frame.towers.length);
   measurement?.resolve();gpu.device.queue.submit([encoder.finish()]);void measurement?.read();finish?.();finishShots?.();finishInfantry?.();
 }
 function frame(now:number){
   if(failed)return;
   try{
     const cpuStart=cpuProfile?performance.now():0;
     const elapsed=(now-previous)/1000;previous=now;metrics.push(elapsed*1000);
     renderer.setResolutionScale?.(graphics.observe(elapsed*1000,!document.hidden&&!state.paused));
     const active=state.mode==='lab'||enemiesActive();
     if(!editor.active&&panKeys.size){const speed=52*(panFast?2:1)*elapsed;renderer.pan((panKeys.has('d')?speed:0)-(panKeys.has('a')?speed:0),(panKeys.has('s')?speed:0)-(panKeys.has('w')?speed:0));}
     const steps=editor.active?0:clock.advance(elapsed,state.paused||!active,state.simulationSpeed??1);
     if(active&&!state.paused&&!editor.active)simulationRate.push(elapsed,steps*clock.step);else simulationRate.reset();
     for(let i=0;i<steps;i++)tick();
     const cpuEffectsStart=cpuProfile?performance.now():0;cpuProfile?.record('Simulation and frame setup',cpuEffectsStart-cpuStart);
     const effectsElapsed=active?steps*clock.step:elapsed;
     if(!state.paused){for(const effect of visuals)effect.duration-=effectsElapsed;visuals=visuals.filter(e=>e.duration>0);for(const particle of visualParticles)particle.age+=effectsElapsed;visualParticles=visualParticles.filter(particle=>particle.age<particle.life);for(const explosion of heavyExplosions)explosion.age+=effectsElapsed;heavyExplosions=heavyExplosions.filter(explosion=>explosion.age<explosion.life);for(const projectile of infantryRocketProjectiles)projectile.age+=effectsElapsed;const infantryImpacts=infantryRocketProjectiles.filter(projectile=>projectile.age>=projectile.life);infantryRocketProjectiles=infantryRocketProjectiles.filter(projectile=>projectile.age<projectile.life);for(const projectile of infantryImpacts)detonateInfantryRocket(projectile);for(const explosion of infantryRocketExplosions)explosion.age+=effectsElapsed;infantryRocketExplosions=infantryRocketExplosions.filter(explosion=>explosion.age<explosion.life);const advanced=advanceHeavyProjectiles(heavyProjectiles,0,clock.tick);heavyProjectiles=advanced.active;for(const impact of advanced.impacts)detonateHeavy(impact);for(const popup of pressurePopups)popup.age+=effectsElapsed;for(const popup of pressurePopups.filter(popup=>popup.age>=popup.life))popup.element.remove();pressurePopups=pressurePopups.filter(popup=>popup.age<popup.life);cameraShake*=Math.exp(-8.5*effectsElapsed);}
     const cpuRenderStart=cpuProfile?performance.now():0;cpuProfile?.record('Effects update',cpuRenderStart-cpuEffectsStart);
     const nativeEncoder=gpu.device.createCommandEncoder({label:'Present'}),measurement=profiler?.wrap(nativeEncoder),encoder=measurement?.encoder??nativeEncoder;
     const placement=pointer?towerPlacement(pointer):undefined;
     const placementKind=state.buildTool==='wall'||state.buildTool==='fence'||state.buildTool==='wire'?state.buildTool:undefined;
     const structurePlacement=pointer&&placementKind?(placementKind==='wall'?wallAt(pointer):barrierAt(pointer)):undefined;
     const movingTower=movingTowerId===null?undefined:run.model.towers.find(tower=>tower.id===movingTowerId),ghostKind=state.selectedKind??movingTower?.kind;
     const ghost=state.mode==='game'&&ghostKind&&placement?{...placement,kind:ghostKind,range:compileTower({id:0,kind:ghostKind,x:placement.x,y:placement.y,level:movingTower?.level??0,branch:movingTower?.branch??-1,angle:0,cooldown:0,spent:0},run.model.bonuses,run.model.commandUpgrades,run.statModifiers()).range,valid:(state.selectedKind!=='crusher'||!crusherPassageIssue(map,run.model.towers,placement))&&canPlace(map,run.model.towers.filter(tower=>tower.id!==movingTowerId),placement,1.25,towerMounts())&&run.model.phase!=='won'&&run.model.phase!=='lost'}:undefined;
     const targetingTower=targetingTowerId===null?undefined:run.model.towers.find(tower=>tower.id===targetingTowerId),targetRange=targetingTower?compileTower(targetingTower,run.model.bonuses,run.model.commandUpgrades,run.statModifiers()).range:0;
     const groundTargetGhost=state.targetMode&&targetingTower&&pointer?{...pointer,originX:targetingTower.x,originY:targetingTower.y,range:targetRange,valid:Math.hypot(pointer.x-targetingTower.x,pointer.y-targetingTower.y)<=targetRange}:undefined;
     const selectedTower=run.model.selected===null?undefined:run.model.towers.find(tower=>tower.id===run.model.selected),selectionRange=selectedTower?compileTower(selectedTower,run.model.bonuses,run.model.commandUpgrades,run.statModifiers()).range:undefined;
     const existingWall=placementKind==='wall'&&structurePlacement?builtWalls.find(wall=>wall.x===structurePlacement.x&&wall.y===structurePlacement.y):undefined;
     const placementGhost=state.mode==='game'&&placementKind==='wall'&&structurePlacement?{...structurePlacement,kind:placementKind,valid:run.model.phase!=='won'&&run.model.phase!=='lost'&&run.model.metal>=METAL_WALL_COST&&(existingWall?existingWall.health<existingWall.maxHealth:!previewStructure(map,run.model.towers,structurePlacement))}:undefined;
     const previewPoints=barrierDrag?.points,barrierPreview=state.mode==='game'&&barrierDrag?barrierPlan(barrierDrag.kind,barrierDrag.kind==='fence'?[previewPoints![0],previewPoints!.at(-1)!]:simplifyBarrier(previewPoints!)):undefined;
     const placementGhosts=barrierPreview?.sections.map(section=>({...section,kind:barrierDrag!.kind,valid:barrierPreview.valid}));
     const infantrySelectionBox=infantryDrag?{x:Math.min(infantryDrag.start.x,infantryDrag.current.x),y:Math.min(infantryDrag.start.y,infantryDrag.current.y),width:Math.abs(infantryDrag.current.x-infantryDrag.start.x),height:Math.abs(infantryDrag.current.y-infantryDrag.start.y)}:undefined;
     renderer.encode(encoder,{barracksGhost:!editor.active&&state.mode==='game'&&infantry.tool==='build'&&pointer?infantry.preview(pointer):undefined,infantry:!editor.active&&state.mode==='game'?infantry.state():undefined,selectedBarracks:infantry.selected,selectedBarracksSet:infantry.selectedBuildings,selectedInfantry:infantry.selectedSoldiers,infantrySelectionBox,infantryCommandTarget:infantry.commandTarget,aftermathVisible:!editor.active,corpseFieldApproach:state.mode==='game'?HORDE_APPROACH:0,count:editor.active?0:count,time:simulatedTime,map:editor.active?editor.map:map,towers:!editor.active&&state.mode==='game'?run.model.towers:[],effects:editor.active?[]:visuals,visualParticles:editor.active?[]:visualParticles,heavyProjectiles:editor.active?[]:heavyProjectiles,heavyExplosions:editor.active?[]:heavyExplosions,infantryRocketProjectiles:editor.active?[]:infantryRocketProjectiles,infantryRocketExplosions:editor.active?[]:infantryRocketExplosions,cameraShake:editor.active?0:cameraShake,walls:editor.active?[]:builtWalls,fences:editor.active?[]:builtFences,wires:editor.active?[]:builtWires,barrierSegments:[...builtFences,...builtWires],heatmap:state.heatmap,selection:run.model.selected,selectionRange,ghost:editor.active?undefined:ghost,groundTargetGhost,placementGhost,placementGhosts,boss:!editor.active&&latest.boss?.active?latest.boss:undefined});
     const arena=ui.canvas.parentElement!.getBoundingClientRect();for(const popup of pressurePopups){const screen=renderer.worldToScreen(popup.x,popup.y),progress=popup.age/popup.life;popup.element.style.left=`${screen.x-arena.left+popup.drift*progress}px`;popup.element.style.top=`${screen.y-arena.top-progress*34}px`;popup.element.style.opacity=String(Math.min(1,(1-progress)*2.8));}
     measurement?.resolve();gpu.device.queue.submit([encoder.finish()]);void measurement?.read();
     coop.frame(now);
     const cpuUIStart=cpuProfile?performance.now():0;cpuProfile?.record('Render encoding',cpuUIStart-cpuRenderStart);
     if(now-lastUI>100)updateUI(now);else{positionInspector();positionUpgradeInspector();positionInfantryInspector();}
     if(cpuProfile){const end=performance.now();cpuProfile.record('UI and autosave',end-cpuUIStart);cpuProfile.record('Frame CPU total',end-cpuStart);}
     requestAnimationFrame(frame);
   }catch(error){fail(error);}
 }
 let restored=false;
 if(state.mode==='game')restored=restoreSession();
 resetWorld(!restored);updateUI(performance.now());requestAnimationFrame(frame);
} catch(error){state.message=String(error);state.paused=true;ui.update(state);console.error(error);}

}

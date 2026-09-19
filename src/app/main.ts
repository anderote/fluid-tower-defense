import { connectGPU } from '../runtime/gpu.ts';
import { verifyABI } from '../runtime/abi-check.ts';
import { FixedClock } from '../runtime/clock.ts';
import { FrameMetrics } from '../runtime/metrics.ts';
import { SettlementReader } from '../runtime/readback.ts';
import { createLevelEditor } from '../editor/index.ts';
import '../editor/style.css';
import { createUI } from '../ui/index.ts';
import { createRenderer } from '../render/index.ts';
import {createBoss} from '../sim/bosses/index.ts';
import { createPhysics } from '../sim/physics/index.ts';
import { createCombat, type CombatFrame } from '../sim/combat/index.ts';
import { createParticles, DEFAULT_MAP, compileTower, TOWERS } from '../content/index.ts';
import { buildNavigation, canPlace } from '../navigation/index.ts';
import { createRun } from '../game/index.ts';
import { DEFAULT_TUNING, PARTICLE_FLOATS, type UIState, type GameAction, type Effect, type Vec2, type Settlement } from '../contracts/index.ts';

const root=document.querySelector<HTMLElement>('#app')!;
const params=new URLSearchParams(location.search);
if(params.has('validate')) {
 const {showValidation}=await import('./validation-page.ts');await showValidation(root);
} else {
const run=createRun();
const state:UIState={mode:params.get('mode')==='lab'?'lab':'game',phase:'preparation',paused:false,fps:0,frameMs:0,population:10000,capacity:65536,kills:0,crushKills:0,scrap:450,baseHealth:100,wave:0,waveCount:5,selected:null,selectedKind:null,heatmap:false,tool:'blast',message:'Connecting to local GPU…',adapter:'WebGPU',bonusChoices:[]};
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
 let map=DEFAULT_MAP, navigation=buildNavigation(map);
 let epoch=run.epoch,count=0, requestedPopulation=Math.min(50000,Math.max(1,Number(params.get('population'))||10000)), stepRequested=false;
 let commands:Effect[]=[], visuals:Effect[]=[], pointer:Vec2|undefined, lastTickSample=0, waveStartTick=0;
 let latest:Settlement={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
 let lastUI=0, previous=performance.now(), simulatedTime=0;
 const diagnostics=document.createElement('details');diagnostics.className='diagnostics';diagnostics.innerHTML='<summary>Developer diagnostics</summary><pre></pre>';root.append(diagnostics);
 const diagnosticText=diagnostics.querySelector('pre')!;
 const errors:string[]=[];
 let previousPaused=false;
 const editor=createLevelEditor(root.querySelector<HTMLElement>('.view-actions')!,map,newMap=>{
   map=newMap;navigation=buildNavigation(map);run.setMap(map);state.mode='game';resetWorld();previousPaused=false;
   state.message='Custom level ready. Build your defense, then start a wave.';
 },active=>{if(active){previousPaused=state.paused;state.paused=true;state.selectedKind=null;stepRequested=false;state.message='Paint walls on the arena. Right-drag erases. Apply & Play starts a fresh defense.';}else{state.paused=previousPaused;}});

 const settlement=new SettlementReader(gpu.device,s=>{
   if(s.epoch!==epoch)return;
   latest=s;state.population=s.live;state.kills=s.kills;state.crushKills=s.crushKills;
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
   commands=[];visuals=[];count=0;state.kills=state.crushKills=0;state.selectedKind=null;state.selected=null;state.paused=false;
   latest={epoch,tick:0,kills:0,crushKills:0,leaks:0,earned:0,live:0,invalid:0,maxPacking:0};
   if(state.mode==='lab'){
     const batches=requestedPopulation<=10000?[{count:Math.floor(requestedPopulation*.8),kind:'shambler' as const,seed:1},{count:Math.floor(requestedPopulation*.15),kind:'runner' as const,seed:2},{count:requestedPopulation-Math.floor(requestedPopulation*.8)-Math.floor(requestedPopulation*.15),kind:'brute' as const,seed:3}]:[{count:requestedPopulation,kind:'shambler' as const,seed:1}];
     const data=createParticles(batches,map,gpu.shared.capacity);count=data.length/PARTICLE_FLOATS;gpu.device.queue.writeBuffer(gpu.shared.particles,0,data.buffer);
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
     case 'select-tower':state.selectedKind=state.selectedKind===action.kind?null:action.kind;state.message=state.selectedKind?`${TOWERS[state.selectedKind].name}: click a clear build location.`:'Click a tower to inspect it.';break;
     case 'start-wave':{
       const result=run.startWave();actionResult(result,'Wave incoming. Hold the choke.');if(!result.ok)break;
       const batches=run.takeSpawns(gpu.shared.capacity);
       const data=createParticles(batches,map,gpu.shared.capacity);count=data.length/PARTICLE_FLOATS;
       if(count!==batches.reduce((sum,b)=>sum+b.count,0))throw new Error('Wave spawn region capacity must cover the authored wave.');
       gpu.device.queue.writeBuffer(gpu.shared.particles,0,data.buffer);state.population=count;physics.reset();combat.reset();boss.reset(run.isBossWave);waveStartTick=clock.tick+1;state.paused=false;state.selectedKind=null;break;
     }
     case 'upgrade':if(run.model.selected!==null)actionResult(run.upgrade(run.model.selected,action.branch),'Tower upgraded.');break;
     case 'sell':if(run.model.selected!==null)actionResult(run.sell(run.model.selected),'Tower sold.');break;
     case 'bonus':actionResult(run.chooseBonus(action.id),'Bonus installed for this run.');break;
     case 'save':try{run.save();state.message='Saved between waves on this browser.';}catch(error){state.message=String(error);}break;
     case 'load':{const result=run.load();if(result.ok){state.mode='game';resetWorld(false);}actionResult(result,'Saved defense restored.');break;}
   }
   updateUI(performance.now());
 };
 ui.canvas.addEventListener('pointermove',event=>{pointer=renderer.screenToWorld(event.clientX,event.clientY);if(editor.active&&event.buttons)editor.paint(pointer,event.buttons&2?true:undefined);});
 ui.canvas.addEventListener('wheel',event=>{if(editor.active)return;event.preventDefault();renderer.zoomAt(event.deltaY<0?1.13:1/1.13,event.clientX,event.clientY);},{passive:false});
 ui.canvas.addEventListener('contextmenu',event=>{if(editor.active)event.preventDefault();});
 ui.canvas.addEventListener('pointerleave',()=>{pointer=undefined;});
 ui.canvas.addEventListener('pointerdown',event=>{
   if(failed)return;const point=renderer.screenToWorld(event.clientX,event.clientY);
   if(editor.active){editor.paint(point,event.button===2?true:undefined);return;}
   if(state.mode==='game'){
     if(state.selectedKind){const result=run.place(state.selectedKind,point);actionResult(result,result.tower?`${TOWERS[result.tower.kind].name} deployed.`:'Tower deployed.');}
     else{run.model.selected=run.model.towers.find(t=>Math.hypot(t.x-point.x,t.y-point.y)<3.5)?.id??null;}
   }else if(state.tool!=='inspect'){
     if(commands.length>=64){state.message='Effect queue full; advance the simulation.';return;}
     const effect:Effect={...point,kind:state.tool==='blast'?'blast':'push',radius:state.tool==='blast'?10:15,strength:state.tool==='blast'?32:38,damage:state.tool==='blast'?16:0,direction:{x:1,y:0},cone:Math.PI*.7,duration:.55,source:0};commands.push(effect);visuals.push({...effect});
     state.message=state.tool==='blast'?'Concussive blast deployed.':'Pressure pulse deployed toward the base.';
   }else state.message=`World position ${point.x.toFixed(1)}, ${point.y.toFixed(1)} · peak packing ${latest.maxPacking.toFixed(2)}`;
 });
 const panKeys=new Set<string>();
 window.addEventListener('keydown',event=>{if((event.target as HTMLElement).matches('input,textarea,select'))return;const key=event.key.toLowerCase();if(['w','a','s','d'].includes(key)){event.preventDefault();panKeys.add(key);return;}if(event.code==='Space'){event.preventDefault();handleAction({type:'pause'});}if(event.key==='Escape'){state.selectedKind=null;run.model.selected=null;}if(key==='h')handleAction({type:'heatmap',value:!state.heatmap});if(key==='+'||key==='=')renderer.zoomAt(1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);if(key==='-')renderer.zoomAt(1/1.13,ui.canvas.getBoundingClientRect().x+ui.canvas.clientWidth/2,ui.canvas.getBoundingClientRect().y+ui.canvas.clientHeight/2);});
 window.addEventListener('keyup',event=>panKeys.delete(event.key.toLowerCase()));
 function updateUI(now:number){
   const report=metrics.report();state.fps=report.fps;state.frameMs=report.medianMs;
   state.scrap=run.model.scrap;state.baseHealth=run.model.baseHealth/20*100;state.wave=run.model.wave;state.waveCount=run.model.waveCount;state.phase=state.mode==='lab'?'combat':run.model.phase;
   state.selected=run.model.towers.find(t=>t.id===run.model.selected)??null;state.bonusChoices=state.mode==='game'?run.model.bonusChoices:[];
   state.bossHealth=latest.boss?.active?latest.boss.health/latest.boss.maxHealth*100:undefined;
   ui.update(state);lastUI=now;
   diagnosticText.textContent=JSON.stringify({adapter:gpu.adapter,abi:'passed',epoch,tick:clock.tick,simulationSeconds:simulatedTime,slots:count,live:latest.live,requested:requestedPopulation,invalid:latest.invalid,peakPacking:latest.maxPacking,crushKills:latest.crushKills,kills:latest.kills,medianMs:report.medianMs,p95Ms:report.p95Ms,frameSamples:report.samples,canvas:[ui.canvas.width,ui.canvas.height],readbackErrors:errors,boss:latest.boss},null,2);
 }
 function tick(){
   clock.tick++;simulatedTime+=clock.step;
   const effects=commands;commands=[];
   const frame:CombatFrame={dt:clock.step,tick:clock.tick,count,map,effects,tuning:DEFAULT_TUNING,navigation,lab:state.mode==='lab',towers:state.mode==='game'?run.model.towers.map(tower=>({tower,definition:compileTower(tower,run.model.bonuses)})):[]};
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
     if(!state.paused){for(const effect of visuals)effect.duration-=elapsed;visuals=visuals.filter(e=>e.duration>0);}
     const encoder=gpu.device.createCommandEncoder({label:'Present'});
     const ghost=state.mode==='game'&&state.selectedKind&&pointer?{...pointer,kind:state.selectedKind,range:compileTower({id:0,kind:state.selectedKind,x:pointer.x,y:pointer.y,level:0,branch:-1,angle:0,cooldown:0,spent:0},run.model.bonuses).range,valid:canPlace(map,run.model.towers,pointer,1.25)&&run.model.phase==='preparation'}:undefined;
     renderer.encode(encoder,{count:editor.active?0:count,time:simulatedTime,map:editor.active?editor.map:map,towers:!editor.active&&state.mode==='game'?run.model.towers:[],effects:editor.active?[]:visuals,heatmap:state.heatmap,selection:run.model.selected,ghost:editor.active?undefined:ghost,boss:!editor.active&&latest.boss?.active?latest.boss:undefined});
     gpu.device.queue.submit([encoder.finish()]);
     if(now-lastUI>100)updateUI(now);
     requestAnimationFrame(frame);
   }catch(error){fail(error);}
 }
 resetWorld();updateUI(performance.now());requestAnimationFrame(frame);
} catch(error){state.message=String(error);state.paused=true;ui.update(state);console.error(error);}

}

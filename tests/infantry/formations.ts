import {createRun} from '../../src/game/index.ts';
import {createInfantryController} from '../../src/infantry/controller.ts';
import {attachFormationPlacement} from '../../src/infantry/formation-input.ts';
import {formationPoint} from '../../src/infantry/formation.ts';
import {advanceInfantry,infantryStats,type Soldier} from '../../src/infantry/model.ts';
import {createRenderer} from '../../src/render/index.ts';
import type {WorldMap,SharedGPU,RenderScene} from '../../src/contracts/index.ts';
const output=document.querySelector('#results')!,root=document.querySelector<HTMLElement>('#fixture')!,canvas=root.querySelector('canvas')!;
try{
 const map:WorldMap={id:'formation-lab',width:64,height:40,spawn:{x:0,y:10,width:2,height:20},goal:{x:62,y:20},goalRadius:1,obstacles:[{x:24,y:25,width:7,height:4}]};
 const run=createRun(map),controller=createInfantryController(root,run,()=>map,()=>{},()=>{},()=>{}),state=controller.state();
 const center={x:44,y:20};state.buildings=[{id:1,x:57,y:33,kind:'phalanx',rally:center,production:0,training:0,progress:0,spent:220}];state.nextId=26;
 state.soldiers=Array.from({length:24},(_,i):Soldier=>({...formationPoint(center,i,{angle:Math.PI,columns:8}),id:i+2,home:1,kind:'phalanx',quality:0,health:infantryStats('phalanx').health,angle:Math.PI,cooldown:0,flash:0,walk:0,dead:0,moveTarget:center,moveFormation:{angle:Math.PI,columns:8},moveSlot:i}));
 controller.selectAt(state.soldiers[0],false,true);
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice();
 device.addEventListener('uncapturederror',e=>{output.textContent=`FAIL ${e.error.message}`;});
 const shared:SharedGPU={capacity:1,particles:device.createBuffer({size:64,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE})};
 const renderer=await createRenderer(device,canvas.getContext('webgpu')!,navigator.gpu.getPreferredCanvasFormat(),shared,canvas);
 attachFormationPlacement(canvas,{canStart:()=>controller.selectedSoldiers.size>0,point:(x,y)=>renderer.screenToWorld(x,y),preview:(a,b)=>{controller.previewFormation(a,b);},clear:()=>controller.clearFormationPreview(),commit:(a,b)=>{if(b)controller.commandFormation(a,b);else controller.command(a);}});
 canvas.addEventListener('dblclick',e=>{controller.selectAt(renderer.screenToWorld(e.clientX,e.clientY),e.shiftKey,true);});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(e.button===0)controller.selectAt(renderer.screenToWorld(e.clientX,e.clientY),e.shiftKey);});
 let time=0,active=true;const scene:RenderScene={map,towers:[],count:0,time:0,effects:[],heatmap:false,selection:null,infantry:state};
 const draw=()=>{if(!active)return;time+=1/60;controller.update();advanceInfantry(state,controller.ensureFields(),controller.fields,new Map(),1/60,true,[],controller.orderFields);scene.time=time;scene.selectedInfantry=controller.selectedSoldiers;scene.infantryFormationPreview=controller.formationPreview;scene.infantryCommandTarget=controller.commandTarget;const e=device.createCommandEncoder();renderer.encode(e,scene);device.queue.submit([e.finish()]);requestAnimationFrame(draw);};draw();
 output.textContent='READY — 24 hoplites selected. Drag a formation on clear ground.';
 document.querySelector('#preview')!.addEventListener('click',()=>{controller.selectAt(state.soldiers[0],false,true);controller.previewFormation({x:12,y:14},{x:24,y:18});});
 document.querySelector('#inspect')!.addEventListener('click',()=>{controller.clearFormationPreview();state.soldiers[0].kills=42;state.soldiers[0].veterancyXp=42;state.soldiers[0].health=73;controller.selectAt(state.soldiers[0]);controller.update();});
 document.querySelector('#deselect')!.addEventListener('click',()=>{controller.cancel();controller.update();});
 document.querySelector('#checks')!.addEventListener('click',()=>{
  const checks:string[]=[],assert=(ok:boolean,name:string)=>{if(!ok)throw Error(name);checks.push('PASS '+name);};
  const pointer=(phase:string,p:{x:number;y:number},buttons:number)=>{const screen=renderer.worldToScreen(p.x,p.y);canvas.dispatchEvent(new PointerEvent(phase,{clientX:screen.x,clientY:screen.y,button:2,buttons,pointerId:123,bubbles:true}));};
  try{
   controller.selectAt(state.soldiers[0]);controller.update();assert(controller.selectedSoldiers.size===1&&!controller.unitInspector.hidden,'single click opens only that trooper’s inspector');assert(controller.unitInspector.textContent!.includes('Experience')&&controller.unitInspector.textContent!.includes('Kills'),'unit inspector shows XP and kills');
   controller.selectAt(state.soldiers[0],false,true);controller.update();assert(!!controller.unitInspector.hidden,'multi-selection hides individual stats');assert(controller.selectedSoldiers.size===24,'double-click selects the squad');
   const old=JSON.stringify(state.soldiers.map(s=>s.moveTarget));
   pointer('pointerdown',{x:14,y:15},2);pointer('pointermove',{x:23,y:15},2);
   const preview=controller.formationPreview!;assert(preview.valid&&preview.positions.length===24,'right-drag previews every slot');
   assert(JSON.stringify(state.soldiers.map(s=>s.moveTarget))===old,'preview does not issue an early move order');
   pointer('pointerup',{x:23,y:15},0);
   assert(!controller.formationPreview&&state.soldiers.every(s=>Math.abs(s.moveFormation!.angle+Math.PI/2)<.001),'release commits player-facing formation');
   const saved=JSON.stringify(state.soldiers.map(s=>[s.moveTarget,s.moveFormation]));
   pointer('pointerdown',{x:25,y:26},2);pointer('pointermove',{x:30,y:26},2);assert(!controller.formationPreview!.valid,'obstructed formation is red');pointer('pointerup',{x:30,y:26},0);
   assert(JSON.stringify(state.soldiers.map(s=>[s.moveTarget,s.moveFormation]))===saved,'blocked drop preserves previous orders');
   pointer('pointerdown',{x:14,y:15},2);pointer('pointermove',{x:21,y:15},2);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));pointer('pointerup',{x:21,y:15},0);
   assert(!controller.formationPreview&&JSON.stringify(state.soldiers.map(s=>[s.moveTarget,s.moveFormation]))===saved,'Escape cancels without changing orders');
   pointer('pointerdown',{x:20,y:12},2);pointer('pointerup',{x:20,y:12},0);
   assert(state.soldiers.every(s=>Math.abs(s.moveTarget!.x-20)<.001&&s.moveFormation?.columns===preview.columns),'right-click moves while retaining formation');
   assert(createRun(map).load(run.serialize()).ok,'formation orders survive save and reload');
   controller.selectAt(state.soldiers[0]);pointer('pointerdown',{x:18,y:12},2);pointer('pointerup',{x:18,y:12},0);assert(state.soldiers[0].moveFormation?.columns===1,'moving one trooper does not offset it by its former squad width');
   output.textContent=checks.join('\n')+'\nALL CHECKS PASSED';
  }catch(error){output.textContent=checks.join('\n')+'\nFAIL '+String(error);}
 });
 window.addEventListener('pagehide',()=>{active=false;renderer.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){output.textContent='FAIL '+String(error);}

import {createRun} from '../../src/game/index.ts';
import {createInfantryController} from '../../src/infantry/controller.ts';
import type {WorldMap} from '../../src/contracts/index.ts';
const output=document.querySelector('#results')!;
const assert=(ok:boolean,name:string)=>{if(!ok)throw Error(name);output.textContent+='\nPASS '+name;};
try{
 const map:WorldMap={id:'rally-test',width:60,height:50,spawn:{x:0,y:10,width:3,height:20},goal:{x:57,y:20},goalRadius:2,obstacles:[]};
 const root=document.querySelector<HTMLElement>('#fixture')!,run=createRun(map);let saves=0;
 const controller=createInfantryController(root,run,()=>map,()=>{saves++;},()=>{},()=>{});
 const click=(selector:string)=>root.querySelector<HTMLButtonElement>(selector)!.click();
 click('[data-kind="rifle"]');assert(controller.click({x:30,y:25}),'place building');
 assert(controller.tool==='rally','placing a building immediately enters rally mode');
 assert(!root.querySelector<HTMLElement>('[role="status"]')!.hidden,'battlefield instructions are visible');
 assert(controller.inspector.parentElement?.classList.contains('arena')===true,'building inspector floats in the arena, outside the build menu');
 assert(!controller.inspector.hidden,'building inspector opens on placement');
 const original={...controller.state().buildings[0].rally};controller.click({x:30,y:25});
 assert(controller.tool==='rally','blocked rally does not dismiss placement mode');
 assert(controller.state().buildings[0].rally.x===original.x,'blocked rally preserves existing flag');
 controller.click({x:20,y:30});assert(controller.tool===null,'valid rally completes placement');
 assert(controller.state().buildings[0].rally.x===20.5&&saves===2,'rally position is persisted');
 assert(!!root.querySelector<HTMLElement>('[role="status"]')!.hidden,'completed rally hides instructions');
 click('[data-infantry="rally"]');assert(controller.tool==='rally','prominent button re-enters rally mode');
 controller.cancel();controller.update();assert(!!root.querySelector<HTMLElement>('[role="status"]')!.hidden,'cancel hides rally prompt');
 assert(controller.state().buildings[0].rally.x===20.5,'cancel keeps the current flag');
 controller.click({x:30,y:25});assert(!controller.inspector.hidden,'clicking barracks opens inspector');
 click('[aria-label="Minimize BUILDING INSPECTOR"]');assert(controller.inspector.classList.contains('window-collapsed'),'building inspector minimizes');
 click('[aria-label="Expand BUILDING INSPECTOR"]');click('[data-infantry="production"]');assert(controller.state().buildings[0].production===1,'popup purchases building upgrades');
 click('[aria-label="Close BUILDING INSPECTOR"]');assert(!!controller.inspector.hidden,'close dismisses building inspector');
 for(let i=0;i<9;i++){click('[data-kind="dog"]');controller.click({x:8+(i%5)*9,y:8+Math.floor(i/5)*9});controller.cancel();controller.update();}
 assert(controller.state().buildings.length===10,'construction continues beyond eight buildings');
 assert(controller.state().buildings.filter(b=>b.kind==='dog').length===9,'kennel button places dog-producing buildings');
 const restored=createRun(map);assert(restored.load(run.serialize()).ok,'more than eight buildings round-trip through saves');
 output.textContent+='\nALL CHECKS PASSED';
}catch(error){output.textContent+='\nFAIL '+String(error);}

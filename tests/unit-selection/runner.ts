import {createRun} from '../../src/game/index.ts';
import {createInfantryController} from '../../src/infantry/controller.ts';
import type {WorldMap,Vec2} from '../../src/contracts/index.ts';
import type {Soldier} from '../../src/infantry/model.ts';
const result=document.querySelector('#result')!;
try {
 const map:WorldMap={id:'selection',width:100,height:60,spawn:{x:0,y:10,width:2,height:20},goal:{x:98,y:30},goalRadius:1,obstacles:[]};
 const run=createRun(map),controller=createInfantryController(document.querySelector<HTMLElement>('#fixture')!,run,()=>map,()=>{},()=>{},()=>{}),state=controller.state();
 const unit=(id:number,home:number,x:number,kind:Soldier['kind']='archer',health=30):Soldier=>({id,home,x,y:20,kind,health,quality:0,cooldown:0,angle:0,flash:0,walk:0,dead:0});
 state.soldiers=[unit(1,100,10),unit(2,101,20),unit(3,100,70),unit(4,102,30,'rifle'),unit(5,101,40,'archer',0),unit(6,103,50,'archer')];
 const visible=(p:Vec2)=>p.x>=0&&p.x<=50;
 const expect=(ids:number[],label:string)=>{if([...controller.selectedSoldiers].sort((a,b)=>a-b).join(',')!==ids.join(','))throw Error(label);};
 controller.selectAt(state.soldiers[0]);expect([1],'single click only selects clicked unit');
 controller.selectAt(state.soldiers[0]);controller.selectAt(state.soldiers[0],false,visible);
 expect([1,2,6],'double-click includes matching troops from other homes and viewport edge, excludes dead/offscreen/other types');
 if(!controller.unitInspector.hidden)throw Error('group selection should hide individual inspector');
 controller.selectAt(state.soldiers[3]);controller.selectAt(state.soldiers[0],true);controller.selectAt(state.soldiers[0],true);controller.selectAt(state.soldiers[0],true,visible);
 expect([1,2,4,6],'Shift double-click adds type without removing existing unit');
 controller.selectAt(state.soldiers[0],true,visible);expect([1,2,4,6],'repeat Shift double-click keeps matching type selected');
 controller.selectAt(state.soldiers[2],false,p=>p.x>=60);expect([3],'selection respects changed viewport');
 controller.selectAt(state.soldiers[3],false,visible);expect([4],'plain double-click replaces old type');
 state.soldiers.push({...unit(7,104,45,'rifle'),kind:undefined});
 controller.selectAt(state.soldiers[3],false,visible);expect([4,7],'legacy rifle kind matches explicit rifle kind');
 controller.cancel();expect([],'Escape clears selection');
 result.textContent='PASS: visible type selection across buildings, camera bounds, dead units, single click, Shift addition, replacement and legacy units';
} catch(error) {result.textContent=`FAIL: ${error}`;throw error;}

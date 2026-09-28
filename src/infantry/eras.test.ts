import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../game/index.ts';
import {INFANTRY,INFANTRY_ERAS,advanceInfantry,freshInfantry,infantryAvailable,infantryCombatKind,infantryField,infantryStats,firingLinePoint,phalanxPoint,validInfantry,type InfantryKind,type Soldier,type Threat} from './model.ts';
import type {WorldMap} from '../contracts/index.ts';
// The same JS validator serves both the local and hosted co-op relay.
// @ts-expect-error The relay module is plain JavaScript.
import {validRemoteCommand} from '../../scripts/coop-protocol.mjs';
const map:WorldMap={id:'era-test',width:100,height:80,spawn:{x:0,y:39,width:2,height:2},goal:{x:98,y:40},goalRadius:1,obstacles:[]};

test('five eras each expose four unique troops; dogs remain utility',()=>{
 assert.equal(INFANTRY_ERAS.length,5);
 const kinds=INFANTRY_ERAS.flatMap(era=>[...era.kinds]);
 assert.equal(new Set(kinds).size,20);assert.equal(kinds.length,20);
 for(const era of INFANTRY_ERAS){assert.equal(era.kinds.length,4);for(const kind of era.kinds)assert.ok(Object.hasOwn(INFANTRY,kind));}
 assert.ok(infantryAvailable(freshInfantry(),'phalanx'));assert.ok(infantryAvailable(freshInfantry(),'dog'));
 assert.ok(!infantryAvailable(freshInfantry(),'musketeer'));assert.ok(!infantryAvailable(freshInfantry(),'rifle'));
});

test('era purchases are sequential, charged once, and rejected atomically when unaffordable or run ended',()=>{
 const run=createRun(map);run.model.infantry=freshInfantry();run.model.metal=50000;
 assert.equal(run.unlockInfantryEra('ww1').ok,false);assert.equal(run.model.metal,50000);
 let spent=0;
 for(const era of INFANTRY_ERAS.slice(1)){
  assert.ok(run.unlockInfantryEra(era.id).ok);spent+=era.cost;assert.equal(run.model.metal,50000-spent);
  assert.equal(run.unlockInfantryEra(era.id).ok,false);assert.equal(run.model.metal,50000-spent);
  for(const kind of era.kinds)assert.ok(infantryAvailable(run.model.infantry!,kind));
 }
 assert.equal(run.unlockInfantryEra('bogus').ok,false);
 run.reset();run.model.metal=2499;assert.equal(run.unlockInfantryEra('napoleonic').ok,false);assert.equal(run.model.metal,2499);assert.equal(run.model.infantry!.era,0);
 run.model.metal=10000;run.model.phase='lost';assert.equal(run.unlockInfantryEra('napoleonic').ok,false);assert.equal(run.model.metal,10000);
});

test('unlocks survive save and relocation, legacy saves migrate once, invalid era data rejects',()=>{
 const run=createRun(map);run.model.metal=50000;assert.ok(run.unlockInfantryEra('napoleonic').ok);
 const restored=createRun(map);assert.ok(restored.load(run.serialize()).ok);assert.equal(restored.model.infantry!.era,1);
 restored.model.phase='checkpoint';restored.model.wave=10;
 assert.ok(restored.continueRun({...map,id:'next'}).ok);assert.equal(restored.model.infantry!.era,1);
 restored.reset();assert.equal(restored.model.infantry!.era,0);
 const legacy=JSON.parse(run.serialize());delete legacy.model.infantry.era;
 legacy.model.infantry.nextId=2;legacy.model.infantry.buildings=[{id:1,x:70,y:60,kind:'rifle',rally:{x:60,y:40},production:0,training:0,progress:0,spent:120}];
 restored.setMap(map);assert.ok(restored.load(JSON.stringify(legacy)).ok);assert.equal(restored.model.infantry!.era,2);
 restored.model.infantry!.buildings=[];assert.ok(infantryAvailable(restored.model.infantry!,'rifle'),'selling a legacy building must not revoke its era');
 for(const era of [-1,5,1.2,'1',null])assert.equal(validInfantry({...freshInfantry(),era},map),false);
});

function squad(kind:InfantryKind,count=12){
 const state=freshInfantry(),center={x:45,y:40},angle=Math.PI;
 state.nextId=count+2;state.buildings=[{id:1,x:75,y:60,kind,rally:center,production:0,training:0,progress:0,spent:INFANTRY[kind].cost}];
 const point=(i:number)=>kind==='phalanx'?phalanxPoint(center,i,angle):firingLinePoint(center,i,angle);
 state.soldiers=Array.from({length:count},(_,i):Soldier=>({...point(i),id:i+2,home:1,kind,health:infantryStats(kind).health,quality:0,angle,cooldown:0,flash:0,walk:0,dead:0,rallyTarget:center,rallySlot:i}));
 const fields=new Map([[1,infantryField(map,center)]]),threats=new Map<number,Threat>();
 return {state,center,point,fields,threats,step:()=>advanceInfantry(state,map,fields,threats,1/60,true)};
}

test('musketeers reform two ranks, settle before firing, and close a casualty gap',()=>{
 const f=squad('musketeer');f.state.soldiers.forEach(s=>{s.x+=3;});
 for(let i=0;i<180;i++){
  for(const s of f.state.soldiers)f.threats.set(s.id,{target:0,generation:1,x:35,y:s.y,age:0,contact:0});
  const shots=f.step();if(i===0)assert.equal(shots.length,0,'displaced musketeers do not fire while marching');
 }
 for(const [i,s] of f.state.soldiers.entries())assert.ok(Math.hypot(s.x-f.point(i).x,s.y-f.point(i).y)<.3);
 for(const s of f.state.soldiers){s.cooldown=0;f.threats.set(s.id,{target:0,generation:1,x:35,y:s.y,age:0,contact:0});}
 assert.equal(f.step().length,12);
 const fallen={...f.state.soldiers[0]},survivor=f.state.soldiers[1];f.state.soldiers[0].health=0;f.threats.clear();
 for(let i=0;i<120;i++)f.step();
 assert.ok(Math.hypot(survivor.x-fallen.x,survivor.y-fallen.y)<.3);
});

test('crowd contact pushes formations back; phalanxes resist more and ranks recover afterward',()=>{
 const hoplites=squad('phalanx'),muskets=squad('musketeer');
 const initial=(f:ReturnType<typeof squad>)=>f.state.soldiers.reduce((sum,s)=>sum+s.x,0)/f.state.soldiers.length;
 const h0=initial(hoplites),m0=initial(muskets);
 for(let i=0;i<30;i++)for(const f of [hoplites,muskets]){
  for(const s of f.state.soldiers)f.threats.set(s.id,{target:0,generation:1,x:s.x-1,y:s.y,age:0,contact:0,pushX:2,pushY:0,pressure:30});
  f.step();
 }
 const hPush=initial(hoplites)-h0,mPush=initial(muskets)-m0;
 assert.ok(hPush>.05,`shield wall should yield: ${hPush}`);assert.ok(mPush>hPush,`unshielded line ${mPush} should yield more than shield wall ${hPush}`);
 for(const f of [hoplites,muskets]){f.threats.clear();for(let i=0;i<90;i++)f.step();}
 assert.ok(Math.abs(initial(hoplites)-h0)<.25);assert.ok(Math.abs(initial(muskets)-m0)<.25);
});

test('pressure displacement cannot push a formation through an obstacle',()=>{
 const f=squad('musketeer',1),s=f.state.soldiers[0];s.x=49.59;
 const blocked={...map,obstacles:[{x:50,y:0,width:5,height:80}]};
 for(let i=0;i<60;i++){f.threats.set(s.id,{target:-1,generation:0,x:0,y:0,age:0,contact:0,pushX:50});advanceInfantry(f.state,blocked,f.fields,f.threats,1/60,true);}
 assert.ok(s.x<49.6);
});

test('co-op accepts every roster building and only known era purchases; GPU families stay stable',()=>{
 for(const kind of Object.keys(INFANTRY) as InfantryKind[])assert.ok(validRemoteCommand({type:'infantry',action:'build',kind}));
 for(const era of INFANTRY_ERAS.slice(1))assert.ok(validRemoteCommand({type:'infantry',action:'unlock-era',kind:era.id}));
 assert.equal(validRemoteCommand({type:'infantry',action:'unlock-era',kind:'classical'}),false);
 assert.equal(validRemoteCommand({type:'infantry',action:'unlock-era',kind:'fake'}),false);
 assert.equal(validRemoteCommand({type:'infantry',action:'build',kind:'fake'}),false);
 assert.equal(infantryCombatKind('bazooka'),1);assert.equal(infantryCombatKind('raider'),2);assert.equal(infantryCombatKind('phalanx'),5);
 assert.equal(infantryCombatKind('archer'),0);
});

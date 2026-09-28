import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MAX_VETERANCY,veterancyXpForLevel} from '../content/index.ts';
import {createRun} from '../game/index.ts';
import type {WorldMap} from '../contracts/index.ts';
import {INFANTRY,INFANTRY_VETERANCY_KILLS,infantryVeterancyLevel,infantryVeterancyXpForLevel,awardInfantryKills,freshInfantry,infantryStats,type InfantryKind,type Soldier} from './model.ts';
const soldier=(kind:InfantryKind,id=2):Soldier=>({id,home:1,kind,x:15,y:15,quality:0,health:20,cooldown:0,angle:0,flash:0,walk:0,dead:0,kills:0,veterancy:0,veterancyXp:0});

test('every infantry type has exact, increasing rank boundaries and a capped progression',()=>{
 assert.deepEqual(Object.keys(INFANTRY_VETERANCY_KILLS).sort(),Object.keys(INFANTRY).sort());
 for(const kind of Object.keys(INFANTRY) as InfantryKind[]){
  assert.equal(infantryVeterancyLevel(kind,-1),0);
  for(let rank=1;rank<=MAX_VETERANCY;rank++){
   const threshold=infantryVeterancyXpForLevel(kind,rank);
   assert.equal(infantryVeterancyLevel(kind,threshold-1),rank-1,`${kind} before rank ${rank}`);
   assert.equal(infantryVeterancyLevel(kind,threshold),rank,`${kind} at rank ${rank}`);
  }
  assert.equal(infantryVeterancyLevel(kind,1e9),MAX_VETERANCY);
  assert.equal(infantryVeterancyXpForLevel(kind,101),infantryVeterancyXpForLevel(kind,100));
 }
});
test('slow single-target troops rank faster than rapid and area weapons, all faster than towers',()=>{
 assert.equal(infantryVeterancyXpForLevel('archer',1),2);
 assert.equal(infantryVeterancyXpForLevel('archer',5),50);
 assert.equal(infantryVeterancyXpForLevel('archer',10),200);
 assert.equal(veterancyXpForLevel(10),6480);
 for(const kind of Object.keys(INFANTRY) as InfantryKind[])assert.ok(infantryVeterancyXpForLevel(kind,10)<veterancyXpForLevel(10));
 assert.ok(infantryVeterancyLevel('archer',50)>infantryVeterancyLevel('machinegun',50));
 assert.ok(infantryVeterancyLevel('rifle',50)>infantryVeterancyLevel('rocket',50));
});
test('credited kills award individual role-based ranks without healing or changing kill credit',()=>{
 const state=freshInfantry();state.soldiers=[soldier('archer',2),soldier('rocket',3)];
 awardInfantryKills(state,[2,3],[50,50]);
 assert.deepEqual(state.soldiers.map(s=>s.kills),[50,50]);
 assert.deepEqual(state.soldiers.map(s=>s.veterancyXp),[50,50]);
 assert.deepEqual(state.soldiers.map(s=>s.veterancy),[5,2]);
 assert.deepEqual(state.soldiers.map(s=>s.health),[20,20]);
 assert.ok(infantryStats('archer',0,0,5).damage>infantryStats('archer').damage);
 awardInfantryKills(state,[2,999],[0,100]);assert.equal(state.soldiers[0].veterancy,5);
});
test('loading old infantry revalues stored kills immediately and remains stable across saves',()=>{
 const map:WorldMap={id:'veterancy-save',width:50,height:40,spawn:{x:0,y:10,width:2,height:20},goal:{x:48,y:20},goalRadius:1,obstacles:[]};
 for(const legacyKillsOnly of [false,true]){
  const run=createRun(map),state=freshInfantry();state.nextId=3;
  state.buildings=[{id:1,kind:'archer',x:10,y:10,rally:{x:15,y:15},production:0,training:0,progress:0,spent:INFANTRY.archer.cost}];
  const unit=soldier('archer');unit.kills=80;unit.veterancy=1;unit.veterancyXp=80;
  if(legacyKillsOnly)delete unit.veterancyXp;
  state.soldiers=[unit];run.model.infantry=state;
  const restored=createRun(map);assert.equal(restored.load(run.serialize()).ok,true);
  const veteran=restored.model.infantry!.soldiers[0];
  assert.equal(veteran.veterancy,6);assert.equal(veteran.veterancyXp,80);assert.equal(veteran.kills,80);assert.equal(veteran.health,20);
  const again=createRun(map);assert.equal(again.load(restored.serialize()).ok,true);
  assert.deepEqual(again.model.infantry!.soldiers,[veteran]);
 }
});

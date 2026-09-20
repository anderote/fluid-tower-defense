import assert from 'node:assert/strict';
import test from 'node:test';
import {INFANTRY,infantryStats,type InfantryKind,advanceInfantry,awardInfantryKills,clearForSoldier,clearInfantryPath,freshInfantry,infantryMap,infantryField,rifleStats,recruitInterval,validInfantry,type Threat} from './model.ts';
import {createRun} from '../game/index.ts';
import type {WorldMap} from '../contracts/index.ts';
const map:WorldMap={id:'infantry-test',width:50,height:40,spawn:{x:0,y:10,width:3,height:20},goal:{x:47,y:20},goalRadius:2,obstacles:[]};
test('each specialized building produces only its own infantry at its configured rate',()=>{
  for(const kind of Object.keys(INFANTRY) as InfantryKind[]){const f=setup(kind);f.step(INFANTRY[kind].interval-.1);assert.equal(f.state.soldiers.length,0);f.step(.2);const s=f.state.soldiers[0];assert.equal(s.kind,kind);assert.equal(s.health,infantryStats(kind).health);assert.ok(validInfantry(f.state,map));}
});
test('armor reduces zombie damage but even fully armored samurai can be killed',()=>{
  const f=setup('samurai');f.state.buildings[0].defense=5;f.step(12.1);const s=f.state.soldiers[0],hp=s.health;
  const threaten=()=>f.threats.set(s.id,{target:0,generation:1,x:s.x+1,y:s.y,age:0,contact:120});
  threaten();advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true);assert.ok(Math.abs(s.health-(hp-120*.1*(1-infantryStats('samurai',0,5).armor)))<.0001);
  for(let i=0;i<100&&s.health>0;i++){threaten();advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true);}
  assert.equal(s.health,0);
});
test('samurai close toward nearby zombies and sweep only once within melee range',()=>{
  const f=setup('samurai');f.step(16);const s=f.state.soldiers[0];const x=s.x;
  f.threats.set(s.id,{target:0,generation:1,x:s.x-6,y:s.y,contact:0,age:0});
  assert.equal(advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true).length,0);assert.ok(s.x<x);
  f.threats.set(s.id,{target:0,generation:1,x:s.x-2,y:s.y,contact:0,age:0});
  assert.equal(advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true).length,1);assert.equal(s.flash,.28);
});
test('specialized saves reject invalid types and armor while old rifle saves still load',()=>{
  const f=setup('rocket');f.step(13);assert.ok(validInfantry(f.state,map));
  const bad=structuredClone(f.state);bad.soldiers[0].kind='samurai';assert.equal(validInfantry(bad,map),false);
  const armor=structuredClone(f.state);armor.buildings[0].defense=6;assert.equal(validInfantry(armor,map),false);
  const legacy=setup();legacy.step(9);delete legacy.state.buildings[0].kind;delete legacy.state.soldiers[0].kind;delete legacy.state.soldiers[0].defense;assert.ok(validInfantry(legacy.state,map));
});
function setup(kind:InfantryKind='rifle'){ const state=freshInfantry();state.nextId=2;state.buildings.push({id:1,x:20.5,y:20.5,rally:{x:15.5,y:23.5},production:0,training:0,progress:0,spent:INFANTRY[kind].cost,kind});const active=infantryMap(map,state),fields=new Map([[1,infantryField(active,state.buildings[0].rally)]]),threats=new Map<number,Threat>();const step=(seconds:number,combat=true)=>{for(let i=0;i<Math.round(seconds*60);i++)advanceInfantry(state,active,fields,threats,1/60,combat);};return {state,active,fields,threats,step};}
test('recruitment pauses outside combat, caps living squads and resumes after casualties',()=>{
  const f=setup();f.step(80,false);assert.equal(f.state.soldiers.length,0);f.step(8.1);assert.equal(f.state.soldiers.length,1);f.step(80);assert.equal(f.state.soldiers.filter(s=>s.health>0).length,8);const first=f.state.soldiers[0];first.health=0;f.step(8.1);assert.equal(f.state.soldiers.filter(s=>s.health>0).length,8);assert.ok(!f.state.soldiers.some(s=>s.id===first.id));
});
test('training snapshots recruits and production upgrades preserve normalized progress',()=>{
  const f=setup();f.step(8.1);const first=f.state.soldiers[0];f.state.buildings[0].training=3;f.state.buildings[0].production=5;f.step(recruitInterval(5)+.1);assert.equal(first.quality,0);assert.equal(first.health,40);assert.equal(f.state.soldiers[1].quality,3);assert.equal(f.state.soldiers[1].health,rifleStats(3).health);
});
test('infantry ranks from credited kills and shares doctrine research with towers',()=>{
 const f=setup();f.step(8.1);const rifle=f.state.soldiers[0],base=infantryStats('rifle'),researched=infantryStats('rifle',0,0,0,['damage','range','rate']);
 awardInfantryKills(f.state,[rifle.id],[80]);
 assert.equal(rifle.kills,80);assert.equal(rifle.veterancyXp,80);assert.equal(rifle.veterancy,1);
 assert.ok(infantryStats('rifle',0,0,rifle.veterancy).damage>base.damage);
 assert.ok(researched.damage>base.damage&&researched.range>base.range&&researched.cooldown<base.cooldown);
});
test('rally movement reaches the firing line and stale threats cannot fire or hurt troops',()=>{
  const f=setup();f.step(8.1);const s=f.state.soldiers[0],rally=f.state.buildings[0].rally;f.step(4);assert.ok(Math.hypot(s.x-rally.x,s.y-rally.y)<3);
  f.threats.set(s.id,{target:0,generation:7,x:s.x-2,y:s.y,contact:120,age:1});const hp=s.health;assert.equal(advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true).length,0);assert.equal(s.health,hp);
  f.threats.set(s.id,{target:0,generation:7,x:s.x-2,y:s.y,contact:10,age:0});const shots=advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true);assert.equal(shots[0].generation,7);assert.ok(s.health<hp);
});
test('move orders route infantry around walls and hold the commanded position',()=>{
  const routeMap:WorldMap={id:'ordered-route',width:26,height:18,spawn:{x:0,y:5,width:2,height:8},goal:{x:24,y:9},goalRadius:1,obstacles:[{x:11,y:0,width:2,height:10}]};
  const state=freshInfantry(),building={id:1,x:4.5,y:8.5,rally:{x:8.5,y:8.5},production:0,training:0,progress:0,spent:INFANTRY.rifle.cost,kind:'rifle' as const};state.buildings.push(building);state.nextId=3;
  const soldier={id:2,home:1,kind:'rifle' as const,defense:0,quality:0,x:8.5,y:8.5,health:40,cooldown:0,angle:0,flash:0,walk:0,dead:0,moveTarget:{x:19.5,y:8.5}};state.soldiers.push(soldier);
  const active=infantryMap(routeMap,state),fields=new Map([[1,infantryField(active,building.rally)]]),orders=new Map([[2,infantryField(active,soldier.moveTarget)]]),threats=new Map<number,Threat>();
  assert.equal(clearInfantryPath(active,soldier,soldier.moveTarget),false);
  for(let i=0;i<480;i++){advanceInfantry(state,active,fields,threats,1/60,true,[],orders);assert.ok(clearForSoldier(active,soldier));}
  assert.ok(Math.hypot(soldier.x-soldier.moveTarget.x,soldier.y-soldier.moveTarget.y)<.6);assert.deepEqual(soldier.moveTarget,{x:19.5,y:8.5});
});
test('blocked exits retain completed recruitment without spawning inside walls',()=>{
  const f=setup();const blocked={...f.active,obstacles:[...f.active.obstacles,{x:16,y:16,width:10,height:10}]};for(let i=0;i<600;i++)advanceInfantry(f.state,blocked,f.fields,f.threats,1/60,true);assert.equal(f.state.soldiers.length,0);assert.equal(f.state.buildings[0].progress,1);
});
test('infantry saves round-trip; invalid squads reject atomically; relocation refunds buildings',()=>{
  const f=setup();f.step(9);const run=createRun(map);run.model.infantry=f.state;const saved=run.serialize(),restored=createRun(map);assert.ok(restored.load(saved).ok);assert.deepEqual(restored.model.infantry,f.state);assert.ok(validInfantry(f.state,map));
  const bad=JSON.parse(saved);bad.model.infantry.soldiers[0].health=9999;const before=restored.serialize();assert.equal(restored.load(JSON.stringify(bad)).ok,false);assert.equal(restored.serialize(),before);
  const legacy=JSON.parse(saved);delete legacy.model.infantry;assert.ok(restored.load(JSON.stringify(legacy)).ok);assert.equal(restored.model.infantry!.buildings.length,0);
  run.model.wave=10;run.model.phase='checkpoint';const metal=run.model.metal;assert.ok(run.continueRun({...map,id:'next'}).ok);assert.equal(run.model.metal,metal+600);assert.equal(run.model.infantry!.soldiers.length,0);
});

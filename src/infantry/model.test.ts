import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceInfantry,freshInfantry,infantryMap,infantryField,rifleStats,recruitInterval,validInfantry,type Threat} from './model.ts';
import {createRun} from '../game/index.ts';
import type {WorldMap} from '../contracts/index.ts';
const map:WorldMap={id:'infantry-test',width:50,height:40,spawn:{x:0,y:10,width:3,height:20},goal:{x:47,y:20},goalRadius:2,obstacles:[]};
function setup(){const state=freshInfantry();state.nextId=2;state.buildings.push({id:1,x:20.5,y:20.5,rally:{x:15.5,y:23.5},production:0,training:0,progress:0,spent:600});const active=infantryMap(map,state),fields=new Map([[1,infantryField(active,state.buildings[0].rally)]]),threats=new Map<number,Threat>();const step=(seconds:number,combat=true)=>{for(let i=0;i<Math.round(seconds*60);i++)advanceInfantry(state,active,fields,threats,1/60,combat);};return {state,active,fields,threats,step};}
test('recruitment pauses outside combat, caps living squads and resumes after casualties',()=>{
  const f=setup();f.step(80,false);assert.equal(f.state.soldiers.length,0);f.step(8.1);assert.equal(f.state.soldiers.length,1);f.step(80);assert.equal(f.state.soldiers.filter(s=>s.health>0).length,8);const first=f.state.soldiers[0];first.health=0;f.step(8.1);assert.equal(f.state.soldiers.filter(s=>s.health>0).length,8);assert.ok(!f.state.soldiers.some(s=>s.id===first.id));
});
test('training snapshots recruits and production upgrades preserve normalized progress',()=>{
  const f=setup();f.step(8.1);const first=f.state.soldiers[0];f.state.buildings[0].training=3;f.state.buildings[0].production=5;f.step(recruitInterval(5)+.1);assert.equal(first.quality,0);assert.equal(first.health,40);assert.equal(f.state.soldiers[1].quality,3);assert.equal(f.state.soldiers[1].health,rifleStats(3).health);
});
test('rally movement reaches the firing line and stale threats cannot fire or hurt troops',()=>{
  const f=setup();f.step(8.1);const s=f.state.soldiers[0],rally=f.state.buildings[0].rally;f.step(4);assert.ok(Math.hypot(s.x-rally.x,s.y-rally.y)<3);
  f.threats.set(s.id,{target:0,generation:7,x:s.x-2,y:s.y,contact:120,age:1});const hp=s.health;assert.equal(advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true).length,0);assert.equal(s.health,hp);
  f.threats.set(s.id,{target:0,generation:7,x:s.x-2,y:s.y,contact:10,age:0});const shots=advanceInfantry(f.state,f.active,f.fields,f.threats,.1,true);assert.equal(shots[0].generation,7);assert.ok(s.health<hp);
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

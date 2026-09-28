import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSaveKey,migrateMapSlots} from './map-slots.ts';
import {campaignMap} from '../content/levels.ts';
import {DAM_ID} from '../content/dam.ts';
import {createRun} from '../game/index.ts';
import {advanceInfantry,freshInfantry,INFANTRY,infantryField,infantryMap,awardInfantryKills} from '../infantry/model.ts';
import type {WorldMap} from '../contracts/index.ts';
const map:WorldMap={id:'save-test',width:50,height:40,spawn:{x:0,y:10,width:3,height:20},goal:{x:47,y:20},goalRadius:2,obstacles:[]};

test('map slots keep legacy names and separate every map and checkpoint',()=>{
  assert.equal(mapSaveKey(campaignMap(1).id),'pressure-front.autosave.v1');
  assert.equal(mapSaveKey(DAM_ID),'pressure-front.dam.autosave.v1');
  const keys=[1,2,3].flatMap(level=>['autosave','checkpoint'].map(slot=>mapSaveKey(campaignMap(level).id,slot as 'autosave'|'checkpoint')));
  assert.equal(new Set(keys).size,6);
});

test('combat autosave retains army, XP, orders, upgrades, resources and remaining wave without repaying kills',()=>{
  const run=createRun(map),state=freshInfantry();run.model.commandUpgrades=['infantry-armor'];state.era=4;state.nextId=2;
  state.buildings.push({id:1,x:20.5,y:20.5,rally:{x:15.5,y:23.5},production:0,training:0,progress:0,spent:INFANTRY.archer.cost,kind:'archer'});
  const active=infantryMap(map,state),fields=new Map([[1,infantryField(active,state.buildings[0].rally)]]);
  for(let i=0;i<600;i++)advanceInfantry(state,active,fields,new Map(),1/60,true,run.researchModifiers());
  assert.ok(state.soldiers.length);const soldier=state.soldiers[0];
  awardInfantryKills(state,[soldier.id],[12]);soldier.moveTarget={x:25,y:25};soldier.moveFormation={angle:0,columns:4};soldier.moveSlot=0;
  run.model.infantry=state;assert.ok(run.place('autocannon',{x:32,y:20}).ok);
  run.model.level=3;run.model.wave=22;assert.ok(run.startWave().ok);
  run.takeSpawns(100);
  run.applySettlement({epoch:run.epoch,tick:10,kills:20,crushKills:0,leaks:1,earned:50,live:79,invalid:0,maxPacking:0,towerKills:[20]});
  const remaining=run.waveProgress.live+run.waveProgress.queued,metal=run.model.metal;
  const saved=run.serializeSession(),restored=createRun(map);assert.ok(restored.load(saved).ok);
  assert.equal(restored.model.level,3);assert.equal(restored.model.wave,23);assert.equal(restored.model.phase,'combat');
  assert.equal(restored.model.metal,metal);assert.equal(restored.model.baseHealth,19);
  assert.deepEqual(restored.model.infantry,state);assert.deepEqual(restored.model.towers,run.model.towers);
  assert.equal(restored.waveProgress.queued,remaining);assert.equal(restored.waveProgress.live,0);
  const again=createRun(map);assert.ok(again.load(restored.serializeSession()).ok);assert.equal(again.waveProgress.queued,remaining);
  again.applySettlement({epoch:again.epoch,tick:1,kills:1,crushKills:0,leaks:0,earned:2,live:0,invalid:0,maxPacking:0,towerKills:[1]});
  assert.equal(again.model.metal,metal+2);assert.equal(again.model.towers[0].kills,21);
  assert.ok(again.takeSpawns(50,1).length);
});

test('independent map saves retain their own economies and reject cross-map loading',()=>{
  const other={...map,id:'other-map'},a=createRun(map),b=createRun(other),storage=new Map<string,string>();
  a.model.metal=777;a.model.wave=7;b.model.metal=999;b.model.wave=2;
  storage.set(mapSaveKey(map.id),a.serializeSession());storage.set(mapSaveKey(other.id),b.serializeSession());
  assert.ok(a.load(storage.get(mapSaveKey(map.id))).ok);assert.equal(a.model.metal,777);assert.equal(a.model.wave,7);
  assert.ok(b.load(storage.get(mapSaveKey(other.id))).ok);assert.equal(b.model.metal,999);assert.equal(b.model.wave,2);
  assert.equal(a.load(storage.get(mapSaveKey(other.id))).ok,false);assert.equal(a.model.metal,777);
});

test('corrupt combat saves reject atomically and old preparation snapshots still load',()=>{
  const run=createRun(map);assert.ok(run.load(run.serialize()).ok);run.startWave();
  const snapshot=run.serializeSession();
  for(const mutate of [(s:any)=>s.resume.live=-1,(s:any)=>s.resume.spawnElapsed=null,(s:any)=>s.model.pending[0].count=-1,(s:any)=>s.model.pending[0].kind='bad',(s:any)=>s.model.pending[0].duration=0]){
    const bad=JSON.parse(snapshot);mutate(bad);assert.equal(run.load(JSON.stringify(bad)).ok,false);assert.equal(run.serializeSession(),snapshot);
  }
  assert.throws(()=>run.serialize(),/between waves/);
});

test('save during final settlement finishes the wave once, while terminal runs remain terminal',()=>{
  const run=createRun(map);run.startWave();run.takeSpawns(250000);
  run.applySettlement({epoch:run.epoch,tick:1,kills:5000,crushKills:0,leaks:0,earned:5000,live:0,invalid:0,maxPacking:0});
  const restored=createRun(map);assert.ok(restored.load(run.serializeSession()).ok);assert.equal(restored.model.phase,'preparation');
  const paid=restored.model.metal;assert.ok(restored.load(restored.serializeSession()).ok);assert.equal(restored.model.metal,paid);
  restored.model.phase='lost';restored.model.baseHealth=0;assert.ok(restored.load(restored.serializeSession()).ok);assert.equal(restored.model.phase,'lost');
});


test('legacy campaign saves move to their actual map without overwriting newer progress',()=>{
  const entry=mapSaveKey(campaignMap(1).id),destination=mapSaveKey(campaignMap(2).id);
  const old=JSON.stringify({map:{id:campaignMap(2).id},runState:'legacy'}),values=new Map([[entry,old]]);
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  migrateMapSlots(storage,[campaignMap(1).id,campaignMap(2).id]);assert.equal(values.get(destination),old);assert.equal(values.get(entry),old);
  values.set(destination,'newer');migrateMapSlots(storage,[campaignMap(1).id,campaignMap(2).id]);assert.equal(values.get(destination),'newer');
});

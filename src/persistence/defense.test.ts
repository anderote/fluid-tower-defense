import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {createRun} from '../game/index.ts';
import {AUTOSAVE_KEY, CHECKPOINT_KEY, decodeDefense, loadDefense, saveDefense, type Defense} from './defense.ts';

function fixture() {
  const wall={x:20,y:20,width:4,height:4};
  const wire={x:28,y:20,width:4,height:4,health:70,maxHealth:140,breached:false};
  const breached={x:36,y:20,width:4,height:4,health:30,maxHealth:140,breached:true};
  const map={...structuredClone(DEFAULT_MAP),id:'checkpoint-map'};
  map.obstacles.push(wall,wire);
  const defense:Defense={map,spawnBaseline:{...map.spawn},builtWalls:[wall],builtWires:[wire,breached],difficulty:7};
  const run=createRun(map);run.setBuildMounts([wall]);
  assert.equal(run.place('repulsor',{x:22,y:22}).ok,true);
  run.model.wave=3;
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  return {run,defense,data,storage};
}

test('full checkpoint restores mounted towers, custom map, wire condition, economy and flow',()=>{
  const {run,defense,storage}=fixture();
  saveDefense(storage,CHECKPOINT_KEY,run,defense);
  const target=createRun();
  const saved=loadDefense(storage,CHECKPOINT_KEY,target);
  assert.equal(target.model.wave,3);
  assert.equal(target.model.metal,run.model.metal);
  assert.deepEqual(target.model.towers,run.model.towers);
  assert.equal(saved.map.id,'checkpoint-map');
  assert.equal(saved.difficulty,7);
  assert.ok(saved.map.obstacles.includes(saved.builtWalls[0]),'demolition needs shared object identity');
  assert.ok(saved.map.obstacles.includes(saved.builtWires[0]));
  assert.ok(!saved.map.obstacles.includes(saved.builtWires[1]),'breached wire must not block the route');
  assert.deepEqual(saved.builtWires,defense.builtWires);
  assert.deepEqual(saved.spawnBaseline,defense.spawnBaseline);
  const baseline=createRun();baseline.model.wave=3;
  target.startWave();baseline.startWave();
  const total=(batches:{count:number}[])=>batches.reduce((sum,batch)=>sum+batch.count,0);
  assert.ok(total(target.takeSpawns(65_536,1))>total(baseline.takeSpawns(65_536,1)));
});

test('autosaving and resetting cannot overwrite an explicit checkpoint',()=>{
  const {run,defense,storage,data}=fixture();
  saveDefense(storage,CHECKPOINT_KEY,run,defense);
  const checkpoint=data.get(CHECKPOINT_KEY);
  run.reset();run.model.metal=123;
  saveDefense(storage,AUTOSAVE_KEY,run,defense);
  assert.equal(data.get(CHECKPOINT_KEY),checkpoint);
  assert.equal(data.size,2);
  loadDefense(storage,CHECKPOINT_KEY,run);
  assert.equal(run.model.wave,3);
  assert.equal(run.model.metal,560);
});

test('corrupt saves reject atomically without changing the current run, map, or epoch',()=>{
  const {run,defense,storage,data}=fixture();
  saveDefense(storage,CHECKPOINT_KEY,run,defense);
  const good=JSON.parse(data.get(CHECKPOINT_KEY)!);
  const target=createRun();target.place('mortar',{x:80,y:42});
  const before=target.serialize(),epoch=target.epoch;
  const cases=[
    {...good,version:2}, {...good,difficulty:41}, {...good,spawnBaseline:{x:-1,y:2,width:5,height:5}},
    {...good,map:{...good.map,goal:null}}, {...good,builtWalls:[{x:20,y:20,width:-4,height:4}]},
    {...good,builtWires:[{...good.builtWires[0],health:-1}]}, {...good,runState:'{}'},
    {...good,map:{...good.map,obstacles:[{x:60,y:0,width:4,height:100}]}},
  ];
  for(const saved of cases){
    data.set(CHECKPOINT_KEY,JSON.stringify(saved));
    assert.throws(()=>loadDefense(storage,CHECKPOINT_KEY,target));
    assert.equal(target.serialize(),before);
    assert.equal(target.epoch,epoch);
  }
  data.set(CHECKPOINT_KEY,'not json');
  assert.throws(()=>loadDefense(storage,CHECKPOINT_KEY,target));
  assert.equal(target.serialize(),before);
});

test('storage failures are surfaced and serialization cannot save an active wave',()=>{
  const {run,defense}=fixture();
  const denied={getItem:()=>{throw new Error('Storage blocked');},setItem:()=>{throw new Error('Quota exceeded');}};
  assert.throws(()=>saveDefense(denied,CHECKPOINT_KEY,run,defense),/Quota exceeded/);
  const before=run.serialize();
  assert.throws(()=>loadDefense(denied,CHECKPOINT_KEY,run),/Storage blocked/);
  assert.equal(run.serialize(),before);
  assert.throws(()=>loadDefense({getItem:()=>null,setItem:()=>{}},CHECKPOINT_KEY,run),/No saved defense/);
  run.startWave();
  assert.throws(()=>run.serialize(),/between waves/);
});

test('existing unversioned full autosaves remain readable and reconnect breached wire safely',()=>{
  const {run,defense}=fixture();
  const legacy={...defense,runState:run.serialize()};
  legacy.map.obstacles.push(defense.builtWires[1]);
  const saved=decodeDefense(JSON.stringify(legacy));
  assert.equal(saved.difficulty,7);
  assert.ok(!saved.map.obstacles.includes(saved.builtWires[1]));
});

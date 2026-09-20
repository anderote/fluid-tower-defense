import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TOWERS} from '../content/index.ts';
import {createRun} from './index.ts';

test('malformed saved research is rejected without changing the running defense',()=>{
  const run=createRun();
  run.buyStatUpgrade('damage');
  const before=run.serialize();
  const allTowers=Object.keys(TOWERS);
  for(const invalid of [
    {statRanks:{damage:-1}}, {statRanks:{rate:2.5}}, {statRanks:{range:1000000000}},
    {statRanks:{force:'oops'}}, {statRanks:{unknown:1}}, {statRanks:[]},
    {unlockedTowers:['repulsor']}, {unlockedTowers:[...allTowers,'unknown']},
    {unlockedTowers:[...allTowers,'mortar']},
  ]){
    const saved=JSON.parse(before);Object.assign(saved.model,invalid);
    assert.equal(run.load(JSON.stringify(saved)).ok,false);
    assert.equal(run.serialize(),before);
  }
});

test('legacy saves retain existing guns and Metal without using an account XP profile',()=>{
  const run=createRun();run.model.metal=5_000;
  assert.equal(run.place('mortar',{x:84,y:50}).ok,true);
  const saved=JSON.parse(run.serialize());saved.contentVersion='pressure-front-4';
  delete saved.model.unlockedTowers;delete saved.model.statRanks;
  const restored=createRun();
  assert.equal(restored.load(JSON.stringify(saved)).ok,true);
  assert.equal(restored.model.metal,run.model.metal);
  assert.equal(restored.isTowerUnlocked('mortar'),true);
  assert.deepEqual(restored.statModifiers(),[]);
  const again=createRun();assert.equal(again.load(restored.serialize()).ok,true);
  assert.deepEqual(again.model.unlockedTowers,restored.model.unlockedTowers);
});

test('version five saves gain every turret without losing run progress',()=>{
  const run=createRun();
  run.model.metal=1_234;
  const saved=JSON.parse(run.serialize());
  saved.contentVersion='pressure-front-5';
  saved.model.unlockedTowers=['repulsor','autocannon'];
  const restored=createRun();
  assert.equal(restored.load(JSON.stringify(saved)).ok,true);
  assert.equal(restored.model.metal,1_234);
  assert.deepEqual(restored.model.unlockedTowers,Object.keys(TOWERS));
});

test('a fresh run never reads permanent account upgrades',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:()=>{throw new Error('Account profile should not be read');}}}});
  try {
    const run=createRun();
    assert.deepEqual(run.statModifiers(),[]);
    assert.deepEqual(run.model.unlockedTowers,Object.keys(TOWERS));
  } finally {
    if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');
  }
});

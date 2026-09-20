import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CommandProgression} from './index.ts';

function loadProfile(value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {configurable:true,value:{localStorage:{getItem:()=>JSON.stringify(value)}}});
  try { return new CommandProgression(); }
  finally { if(previous) Object.defineProperty(globalThis,'window',previous); else Reflect.deleteProperty(globalThis,'window'); }
}

test('damaged profile ranks recover without losing valid progress or creating invalid arrays',()=>{
  const profile=loadProfile({version:1,xp:120.9,ranks:{damage:-1,rate:2.5,range:1000000000,force:'oops'},unlockedTier:'oops'});
  assert.equal(profile.xp,120);
  assert.equal(profile.unlockedTier,1);
  assert.deepEqual(profile.upgrades().map(upgrade=>upgrade.rank),[0,2,10,0]);
  assert.equal(profile.ranks().length,12);
});

test('valid profile progress round-trips and unsupported profiles start fresh',()=>{
  const profile=loadProfile({version:1,xp:875,ranks:{damage:3,rate:2,unknown:99},unlockedTier:4});
  assert.equal(profile.xp,875);assert.equal(profile.unlockedTier,4);
  assert.deepEqual(profile.ranks(),['damage','damage','damage','rate','rate']);
  for(const value of [null,{version:2,xp:200,ranks:{damage:3}},[]]){
    const fresh=loadProfile(value);assert.equal(fresh.xp,0);assert.deepEqual(fresh.ranks(),[]);
  }
});

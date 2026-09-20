import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceHeavyProjectiles,createHeavyProjectiles} from './heavy-weapons.ts';

test('mortar creates one spinning-shell flight and one impact',()=>{
  const rounds=createHeavyProjectiles('mortar',[{x:1.7,y:0}],{x:10,y:0},7);
  assert.equal(rounds.length,1);assert.equal(rounds[0].x,1.7);
  const before=advanceHeavyProjectiles(rounds,.5);assert.equal(before.impacts.length,0);assert.equal(before.active.length,1);
  const after=advanceHeavyProjectiles(before.active,.05);assert.equal(after.active.length,0);assert.deepEqual(after.impacts[0].direction,{x:1,y:0});
});

test('rocket salvo preserves three lanes and staggered impact timing',()=>{
  const muzzles=[{x:1.95,y:-.52},{x:1.95,y:0},{x:1.95,y:.52}];
  const rounds=createHeavyProjectiles('rocket',muzzles,{x:10,y:0},3);
  assert.deepEqual(rounds.map(({x,y})=>({x,y})),muzzles);
  assert.deepEqual(rounds.map(round=>round.target.y),[-6.6*.48,0,6.6*.48]);
  const first=advanceHeavyProjectiles(rounds,.51);assert.equal(first.impacts.length,1);assert.equal(first.active.length,2);
  const rest=advanceHeavyProjectiles(first.active,.1);assert.equal(rest.impacts.length,2);assert.equal(rest.active.length,0);
});


test('GPU launch ticks keep delayed readbacks, pauses and slow frames on the same impact clock',()=>{
  let rounds=createHeavyProjectiles('rocket',[{x:0,y:0}],{x:20,y:0},1).map(p=>({...p,launchTick:100}));
  let result=advanceHeavyProjectiles(rounds,5,129);
  assert.equal(result.impacts.length,0);
  result=advanceHeavyProjectiles(result.active,5,129);
  assert.equal(result.impacts.length,0,'wall time must not advance paused simulation');
  result=advanceHeavyProjectiles(result.active,0,130);
  assert.deepEqual(result.impacts.map(p=>p.lane),[-1]);
  result=advanceHeavyProjectiles(result.active,0,133);
  assert.deepEqual(result.impacts.map(p=>p.lane),[0]);
  result=advanceHeavyProjectiles(result.active,0,136);
  assert.deepEqual(result.impacts.map(p=>p.lane),[1]);
  assert.equal(advanceHeavyProjectiles(result.active,0,140).impacts.length,0);
});

test('upgraded salvo uses launch angle and radius for the simulation blast centers',()=>{
 const rounds=createHeavyProjectiles('rocket',[{x:2,y:1}],{x:20,y:10},1,1250,10,Math.PI/2);
 assert.deepEqual(rounds.map(p=>p.target.x),[24.8,20,15.2]);
 assert.ok(rounds.every(p=>Math.abs(p.target.y-10)<1e-12));
});

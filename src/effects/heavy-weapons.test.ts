import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceHeavyProjectiles,createHeavyProjectiles} from './heavy-weapons.ts';

test('mortar creates one spinning-shell flight and one impact',()=>{
  const rounds=createHeavyProjectiles('mortar',{x:0,y:0},{x:10,y:0},7);
  assert.equal(rounds.length,1);assert.equal(rounds[0].x,1.55);
  const before=advanceHeavyProjectiles(rounds,.5);assert.equal(before.impacts.length,0);assert.equal(before.active.length,1);
  const after=advanceHeavyProjectiles(before.active,.05);assert.equal(after.active.length,0);assert.deepEqual(after.impacts[0].direction,{x:1,y:0});
});

test('rocket salvo preserves three lanes and staggered impact timing',()=>{
  const rounds=createHeavyProjectiles('rocket',{x:0,y:0},{x:10,y:0},3);
  assert.deepEqual(rounds.map(round=>round.target.y),[-2.1,0,2.1]);
  const first=advanceHeavyProjectiles(rounds,.51);assert.equal(first.impacts.length,1);assert.equal(first.active.length,2);
  const rest=advanceHeavyProjectiles(first.active,.1);assert.equal(rest.impacts.length,2);assert.equal(rest.active.length,0);
});

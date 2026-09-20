import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {buildNavigation,canPlace} from './index.ts';

test('staged default map provides a route through every gate',()=>{
  const field=buildNavigation(DEFAULT_MAP);
  for(const x of [20,52,88,124,150]) assert.ok(Number.isFinite(field.distances[50*field.width+x]));
});
test('navigation offers equivalent alternate steps so enemies can split routes',()=>{
  const field=buildNavigation({...DEFAULT_MAP,obstacles:[]});
  const at=40*field.width+20;
  assert.deepEqual(Array.from(field.vectors.slice(at*2,at*2+2)),[1,0]);
  assert.deepEqual(Array.from(field.alternateVectors.slice(at*2,at*2+2)),[0,1]);
});
test('default walls preserve the clear boss corridor',()=>{
  assert.equal(DEFAULT_MAP.obstacles.length,8);
  assert.ok(DEFAULT_MAP.obstacles.every(wall=>wall.y+wall.height<=47.5||wall.y>=52.5));
});
test('placement allows the corridor and spawn area but rejects walls and overlaps',()=>{ assert.equal(canPlace(DEFAULT_MAP,[],{x:10,y:50},1),true); assert.equal(canPlace(DEFAULT_MAP,[],{x:10,y:40},1),true); assert.equal(canPlace(DEFAULT_MAP,[],{x:86,y:20},1),false); assert.equal(canPlace(DEFAULT_MAP,[],{x:76,y:38},1),false); const towers=[{id:1,kind:'cryo' as const,x:50,y:50,level:0,branch:-1,angle:0,cooldown:0,spent:0}]; assert.equal(canPlace(DEFAULT_MAP,towers,{x:51,y:50},1),false); assert.equal(canPlace(DEFAULT_MAP,towers,{x:72,y:50},1),true); });

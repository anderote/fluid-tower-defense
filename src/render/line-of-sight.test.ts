import assert from 'node:assert/strict';
import test from 'node:test';
import {lineOfSightDistance,lineOfSightPolygon} from './line-of-sight.ts';

test('line of sight stops at the first wall and never exceeds firing range',()=>{
  const origin={x:10,y:10},walls=[{x:15,y:7,width:2,height:6},{x:20,y:7,width:2,height:6}];
  assert.equal(lineOfSightDistance(origin,{x:1,y:0},30,walls),5);
  assert.equal(lineOfSightDistance(origin,{x:-1,y:0},30,walls),30);
  for(const point of lineOfSightPolygon(origin,30,walls))assert.ok(Math.hypot(point.x-origin.x,point.y-origin.y)<=30.000001);
});

test('visibility polygon casts a shadow behind cover while preserving open flanks',()=>{
  const origin={x:10,y:10},wall={x:15,y:8,width:2,height:4};
  const polygon=lineOfSightPolygon(origin,20,[wall],360);
  const forward=polygon.reduce((best,point)=>Math.abs(point.y-origin.y)<Math.abs(best.y-origin.y)?point:best);
  assert.ok(Math.abs(forward.x-wall.x)<.01);
  assert.ok(polygon.some(point=>point.x>25&&point.y>15));
});

test('a turret mounted inside its supporting wall can see outward',()=>{
  const origin={x:16,y:10},support={x:14,y:8,width:4,height:4};
  assert.equal(lineOfSightDistance(origin,{x:1,y:0},18,[support]),18);
});

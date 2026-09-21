import assert from 'node:assert/strict';
import {test} from 'node:test';
import {damMap} from '../content/dam.ts';
import {canPlace,crusherPassageIssue,buildNavigation,mapWithTurretObstacles} from './index.ts';
import {createRun} from '../game/index.ts';
test('island-facing crushers are rejected without spending Metal or breaking save validation',()=>{
 const map=damMap(),run=createRun(map),metal=run.model.metal;
 for(const y of [36,64]){
  const position={x:26,y,kind:'crusher' as const};
  assert.equal(canPlace(map,[],position,1.25),true,'old saved footprint remains valid');
  assert.match(crusherPassageIssue(map,[],position)!,/left and right/);
  assert.equal(run.place('crusher',position).ok,false);
 }
 assert.equal(run.model.metal,metal);assert.equal(run.model.towers.length,0);
});
test('lane-centered crushers have a navigable horizontal mouth and solid jaws',()=>{
 const map=damMap(),run=createRun(map);
 for(const y of [24,50,76]){
  assert.equal(crusherPassageIssue(map,[],{x:44,y}),undefined);
  assert.ok(run.place('crusher',{x:44,y}).ok);
 }
 const nav=buildNavigation(mapWithTurretObstacles(map,run.model.towers));
 for(let x=38;x<=50;x++)assert.ok(Number.isFinite(nav.distances[50*nav.width+x]));
 assert.equal(nav.distances[44*nav.width+44],Infinity);
});
test('passage check accounts for map edges, towers and partially open mouths',()=>{
 const map=damMap();assert.ok(crusherPassageIssue(map,[],{x:5,y:50}));
 map.obstacles.push({x:48,y:45,width:3,height:3});
 assert.equal(crusherPassageIssue(map,[],{x:44,y:50}),undefined);
});

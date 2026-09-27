import {allBattlefields} from '../content/battlefields.ts';
import {barrierSegments} from '../game/barrier-path.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import type {WorldMap} from '../contracts/index.ts';
import {gridRectAtPoint,validateEditorMap,wallAtPoint} from './index.ts';
test('editor permits building in former protected lanes and the spawn area',()=>{
  assert.equal(validateEditorMap(DEFAULT_MAP),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:100,y:48,width:4,height:4}]}),undefined);
  assert.equal(validateEditorMap({...DEFAULT_MAP,obstacles:[{x:4,y:36,width:4,height:4}]}),undefined);
});
test('editor permits sealing the zombie route',()=>{
 const sealed:WorldMap={...DEFAULT_MAP,obstacles:[{x:76,y:0,width:4,height:100}]};
 assert.equal(validateEditorMap(sealed),undefined);
});
test('wall cells snap clicks on every map edge into the last valid cell',()=>{
  assert.deepEqual(wallAtPoint(DEFAULT_MAP,{x:0,y:0}),{x:0,y:0,width:4,height:4});
  assert.deepEqual(wallAtPoint(DEFAULT_MAP,{x:160,y:100}),{x:156,y:96,width:4,height:4});
});
test('half-tile defenses snap to a dense 2 x 2 grid at every map edge',()=>{
  assert.deepEqual(gridRectAtPoint(DEFAULT_MAP,{x:3.9,y:5.9},2),{x:2,y:4,width:2,height:2});
  assert.deepEqual(gridRectAtPoint(DEFAULT_MAP,{x:160,y:100},2),{x:158,y:98,width:2,height:2});
});
test('editor accepts resized maps and more than sixty-four walls',()=>{
  const map:WorldMap={...DEFAULT_MAP,width:320,height:160,spawn:{...DEFAULT_MAP.spawn},goal:{x:316,y:80},obstacles:[]};
  for(let index=0;index<80;index++)map.obstacles.push({x:20+(index%20)*8,y:Math.floor(index/20)*8,width:4,height:4});
  assert.equal(validateEditorMap(map),undefined);
});

// Authored scenery on these maps fails the editor's conservative goal clearance
// check. It must not veto unrelated player construction elsewhere on the map.
test('new fences validate independently of authored scenery on every battlefield',()=>{
 for(const map of allBattlefields()){
  const fence=barrierSegments('fence',1,[{x:10,y:10},{x:15,y:10}]);
  assert.equal(validateEditorMap(map,fence),undefined,map.id);
  assert.equal(validateEditorMap(map,[{x:map.goal.x-.5,y:map.goal.y-.5,width:1,height:1}]),'Walls cannot cover the goal.',map.id);
  assert.equal(validateEditorMap(map,[{x:-1,y:10,width:1,height:1}]),'Walls must stay inside the map.',map.id);
 }
});

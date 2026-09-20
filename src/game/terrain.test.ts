import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {createRun} from './index.ts';
import {clearPlayerTerrain,snapToMount,structurePlacementIssue} from './terrain.ts';

test('reset clears player collisions while preserving authored terrain',()=>{
 const wall={x:20,y:20,width:4,height:4},wire={x:28,y:20,width:4,height:4};
 const map={...DEFAULT_MAP,obstacles:[...DEFAULT_MAP.obstacles,wall,wire]};
 const cleared=clearPlayerTerrain(map,[wall],[wire]);
 assert.deepEqual(cleared.obstacles,DEFAULT_MAP.obstacles);
 assert.equal(map.obstacles.length,DEFAULT_MAP.obstacles.length+2);
});
test('mount snapping centers nearby clicks without moving clear-ground placements',()=>{
 const wall={x:20,y:20,width:4,height:4};
 assert.deepEqual(snapToMount({x:21.7,y:22.3},[wall]),{x:22,y:22});
 assert.deepEqual(snapToMount({x:24,y:22},[wall]),{x:24,y:22});
});
test('structures reject overlaps and tower footprints before spending Metal',()=>{
 const map={...DEFAULT_MAP,obstacles:[...DEFAULT_MAP.obstacles,{x:20,y:20,width:4,height:4}]};
 assert.match(structurePlacementIssue(map,[],{x:22,y:20,width:4,height:4})!,/already contains/);
 const run=createRun();run.place('repulsor',{x:22,y:22});
 assert.match(structurePlacementIssue(DEFAULT_MAP,run.model.towers,{x:20,y:20,width:4,height:4})!,/deployed towers/);
 assert.equal(structurePlacementIssue(DEFAULT_MAP,[],{x:20,y:20,width:4,height:4}),undefined);
});

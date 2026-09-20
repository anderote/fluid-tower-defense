import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DEFAULT_MAP} from '../content/index.ts';
import {createRun} from './index.ts';
import {createStructurePreview,clearPlayerTerrain,restoreSessionTerrain,snapToMount,structurePlacementIssue} from './terrain.ts';

test('reset clears player collisions while preserving authored terrain',()=>{
 const wall={x:20,y:20,width:4,height:4},wire={x:28,y:20,width:4,height:4};
 // Map snapshots and build records are serialized independently, so they need
 // not share object identity when a run is reset.
 const map={...DEFAULT_MAP,obstacles:[...DEFAULT_MAP.obstacles,{...wall},{...wire}]};
 const cleared=clearPlayerTerrain(map,[wall],[wire]);
 assert.deepEqual(cleared.obstacles,DEFAULT_MAP.obstacles);
 assert.equal(map.obstacles.length,DEFAULT_MAP.obstacles.length+2);
});
test('saved default sessions adopt current authored terrain and retain player structures',()=>{
 const wall={x:20,y:20,width:4,height:4},wire={x:28,y:20,width:4,height:4,breached:false},breached={x:36,y:20,width:4,height:4,breached:true};
 const stale={...DEFAULT_MAP,obstacles:[{x:12,y:0,width:4,height:24}]};
 const restored=restoreSessionTerrain(stale,DEFAULT_MAP,[wall],[wire,breached]);
 assert.deepEqual(restored.obstacles,[...DEFAULT_MAP.obstacles,wall,wire]);
 assert.equal(restored.spawn,DEFAULT_MAP.spawn);
});
test('saved custom sessions retain their authored terrain',()=>{
 const custom={...DEFAULT_MAP,id:'custom-map',obstacles:[{x:12,y:0,width:4,height:24}]};
 assert.deepEqual(restoreSessionTerrain(custom,DEFAULT_MAP,[],[]),custom);
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

test('cached previews follow pointer cells, terrain edits, tower placement and reset',()=>{
 const preview=createStructurePreview(),map=structuredClone(DEFAULT_MAP),rect={x:20,y:20,width:4,height:4};
 const run=createRun();
 assert.equal(preview(map,[],rect),undefined);assert.equal(preview(map,[],{...rect}),undefined);
 map.obstacles.push({...rect});assert.match(preview(map,[],rect)!,/already contains/);
 map.obstacles.pop();assert.equal(preview(map,[],rect),undefined);
 run.place('repulsor',{x:22,y:22});assert.match(preview(map,run.model.towers,rect)!,/deployed towers/);
 assert.equal(preview(map,run.model.towers,{...rect,x:28}),undefined);
 assert.equal(preview(map,[],rect),undefined);
 map.goal={x:22,y:22};assert.ok(preview(map,[],rect));
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {damMap,DAM_GATES,validDam} from '../content/dam.ts';
import {advanceDam,releaseFlood,toggleDamGate} from './dam.ts';
import {canPlace,buildNavigation,hasSpawnRoute} from '../navigation/index.ts';
import {terrainMounts,structurePlacementIssue} from './terrain.ts';
import {validateEditorMap} from '../editor/index.ts';
import {createRun} from './index.ts';
import {decodeDefense} from '../persistence/defense.ts';
for(const mask of [0,1,2,3])test(`dam gates ${mask}: entry and boss routes remain open`,()=>{
 const map=damMap();for(const i of [0,1] as const)if(mask&(1<<i)){assert.equal(toggleDamGate(map,i,[]),undefined);map.dam!.switchCooldown=0;}
 assert.equal(validateEditorMap(map),undefined);assert.ok(validDam(map));
 const field=buildNavigation(map);for(let y=0;y<100;y++)assert.ok(Number.isFinite(field.distances[y*160]),`entry ${y}`);
 const boss={...map,obstacles:map.obstacles.map(r=>({x:r.x-3.5,y:r.y-3.5,width:r.width+7,height:r.height+7}))};assert.ok(hasSpawnRoute(boss));
});
test('floodgate machinery rejects towers and walls even when open',()=>{
 const map=damMap(),mounts=terrainMounts(map);
 for(const gate of DAM_GATES){assert.equal(canPlace(map,[],{x:gate.x+2,y:gate.y+2},1.25,mounts),false);assert.ok(structurePlacementIssue(map,[],gate));}
 assert.ok(canPlace(map,[],{x:54,y:38},1.25,mounts));
});
test('reservoir costs a full charge, pauses, recharges, and gates stop their flood lane',()=>{
 const map=damMap();assert.equal(toggleDamGate(map,0,[]),undefined);assert.equal(toggleDamGate(map,1,[]),'Gate machinery is cycling.');
 assert.ok(releaseFlood(map));assert.ok(!releaseFlood(map));assert.equal(map.dam!.reservoir,0);
 assert.deepEqual(advanceDam(map,20,false),[]);assert.equal(map.dam!.surge,3.2);
 assert.equal(toggleDamGate(map,1,[]),'Wait for the surge to pass before moving gates.');
 let effects=advanceDam(map,2.5,true);assert.equal(effects.length,2);assert.ok(effects.every(e=>e.kind==='flood'&&e.direction.x===-1));
 advanceDam(map,.7,true);advanceDam(map,30,true);assert.equal(map.dam!.reservoir,100);assert.ok(releaseFlood(map));
});
test('dam state and mounted towers survive checkpoint validation',()=>{
 const map=damMap(),run=createRun(map);run.setBuildMounts(terrainMounts(map));assert.ok(run.place('tesla',{x:54,y:38}).ok);
 toggleDamGate(map,0,run.model.towers);map.dam!.switchCooldown=0;
 const snapshot={version:1,map,runState:run.serialize(),spawnBaseline:map.spawn,builtWalls:[],builtWires:[],difficulty:1};
 const saved=decodeDefense(JSON.stringify(snapshot));assert.deepEqual(saved.map.dam,map.dam);
 snapshot.map.dam!.reservoir=Infinity;assert.throws(()=>decodeDefense(JSON.stringify(snapshot)),/floodgate/);
});
test('gate closing refuses a player layout that would seal the final route',()=>{
 const map=damMap();map.obstacles.push({x:72,y:42,width:4,height:16},{x:72,y:68,width:4,height:16});
 assert.ok(hasSpawnRoute(map));const before=JSON.stringify(map);
 assert.match(toggleDamGate(map,0,[])!,/clear spillway/);assert.equal(JSON.stringify(map),before);
});

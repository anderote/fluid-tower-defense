import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {terrainMounts} from '../game/terrain.ts';
import {allBattlefields} from './battlefields.ts';
import {buildNavigation} from '../navigation/index.ts';
import {advanceCurrents} from '../game/dam.ts';

test('battlefield picker roster contains every classic map and a full slate of distinct new operations',()=>{
 const maps=allBattlefields(),ids=maps.map(map=>map.id),titles=maps.map(map=>map.scenery?.title);
 assert.equal(maps.length,18);
 assert.equal(new Set(ids).size,maps.length);
 assert.equal(new Set(titles).size,maps.length);
 assert.deepEqual(titles.slice(0,5),['Bastion','Long March','Frostline Outpost','Containment Works','Thunderhead Dam']);
});

test('every authored battlefield has a navigable route from its entry lanes to its objective',()=>{
 for(const map of allBattlefields()){
  const field=buildNavigation(map),entries=map.entries??[{side:'west' as const,from:map.spawn.y,to:map.spawn.y+map.spawn.height}];
  for(const entry of entries){
   const limit=entry.side==='west'||entry.side==='east'?field.height:field.width;
   const start=Math.max(0,Math.floor(entry.from)),end=Math.min(limit,Math.ceil(entry.to));
   const reachable=Array.from({length:Math.max(0,end-start)},(_,i)=>start+i).some(point=>{
    const x=entry.side==='west'?0:entry.side==='east'?field.width-1:point;
    const y=entry.side==='north'?0:entry.side==='south'?field.height-1:point;
    return Number.isFinite(field.distances[y*field.width+x]);
   });
   assert.ok(reachable,`${map.scenery?.title} has no route from ${entry.side}`);
  }
 }
});

test('river and wind lanes create moving environmental push pulses only during combat',()=>{
 const map=allBattlefields().find(candidate=>candidate.scenery?.title==='Floodplain Crossing')!;
 const idle=advanceCurrents(map,1/60,1,false),active=advanceCurrents(map,1/60,1,true);
 assert.deepEqual(idle,[]);assert.equal(active.length,2);
 assert.ok(active.every(effect=>effect.environmental&&effect.kind==='push'&&effect.strength>0));
});

const redoubts=()=>allBattlefields().filter(map=>map.entries?.length===4);
test('half the roster contains distinct central redoubts with scenery and room to build',()=>{
 const maps=redoubts();assert.equal(maps.length,9);
 assert.equal(new Set(maps.map(map=>JSON.stringify(map.scenery!.mounts))).size,9);
 for(const map of maps){
  assert.ok(map.goal.x>50&&map.goal.x<110,map.id);
  assert.ok(map.scenery!.props.filter(prop=>/:v\d/.test(prop.sprite)).length>=4,`${map.id}: village`);
  assert.ok(map.scenery!.props.filter(prop=>/:t/.test(prop.sprite)).length>=12,`${map.id}: woodland`);
  assert.ok(terrainMounts(map).length>12,`${map.id}: wall hardpoints`);
  for(const rect of map.obstacles)assert.ok(Math.hypot(Math.max(rect.x-map.goal.x,0,map.goal.x-rect.x-rect.width),Math.max(rect.y-map.goal.y,0,map.goal.y-rect.y-rect.height))>=map.goalRadius,`${map.id}: objective clearance`);
 }
});
test('all redoubts retain boss-width routes from every attack direction',()=>{
 for(const map of redoubts()){
  const inflated={...map,obstacles:map.obstacles.map(r=>({x:r.x-3.5,y:r.y-3.5,width:r.width+7,height:r.height+7}))};
  const field=buildNavigation(inflated);
  for(const entry of map.entries!){
   const reachable=Array.from({length:entry.to-entry.from},(_,i)=>i+entry.from).some(point=>{
    const x=entry.side==='west'?0:entry.side==='east'?field.width-1:point;
    const y=entry.side==='north'?0:entry.side==='south'?field.height-1:point;
    return Number.isFinite(field.distances[y*field.width+x]);
   });assert.ok(reachable,`${map.id}: boss blocked from ${entry.side}`);
  }
 }
});
test('authored scenery uses existing atlas frames and physical building foundations',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
 for(const map of allBattlefields().slice(5)){
  for(const tile of map.scenery!.tiles){
   assert.ok(atlas.sprites[tile.sprite]?.length>=(tile.firstFrame??0)+tile.columns*tile.rows,`${map.id}: ${tile.sprite}`);
   assert.ok(tile.x>=0&&tile.y>=0&&tile.x+tile.columns*4<=map.width&&tile.y+tile.rows*4<=map.height,`${map.id}: tile bounds ${tile.sprite}`);
  }
  for(const prop of map.scenery!.props){
   assert.ok(atlas.sprites[prop.sprite]?.length,prop.sprite);
   assert.ok(map.scenery!.solids.some(rect=>prop.x>=rect.x&&prop.x<=rect.x+rect.width&&prop.y===rect.y+rect.height),`${map.id}: ${prop.sprite} foundation`);
  }
  for(const solid of map.scenery!.solids)assert.ok(map.obstacles.includes(solid),`${map.id}: scenery collision`);
 }
});

test('Bastion has no preset walls and leaves the straight-through lane open',()=>{
 const map=allBattlefields()[0];assert.equal(terrainMounts(map).length,0);
 assert.deepEqual(map.obstacles,map.scenery!.solids);
 assert.ok(map.scenery!.props.some(prop=>prop.sprite.includes(':v')));
 assert.ok(map.obstacles.every(rect=>rect.y+rect.height<=44||rect.y>=56),'the central approach must stay open');
});

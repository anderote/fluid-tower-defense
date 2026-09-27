import assert from 'node:assert/strict';
import test from 'node:test';
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

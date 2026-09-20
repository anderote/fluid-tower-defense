import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {campaignMap,isCampaignMap} from './levels.ts';
import {buildNavigation,canPlace} from '../navigation/index.ts';
import {validateEditorMap} from '../editor/index.ts';
import {terrainMounts} from '../game/terrain.ts';
import {createRun} from '../game/index.ts';
import {decodeDefense} from '../persistence/defense.ts';

for(const level of [1,2,3]){
  test(`campaign ${level}: authored bounds, entry frontage, scenery assets and boss route are valid`,()=>{
    const map=campaignMap(level),scenery=map.scenery!,field=buildNavigation(map);
    assert.equal(validateEditorMap(map),undefined);assert.ok(isCampaignMap(map));
    for(let y=0;y<100;y++)assert.ok(Number.isFinite(field.distances[y*field.width]),`west entry ${y} cannot reach the goal`);
    const inflated={...map,obstacles:map.obstacles.map(r=>({x:r.x-3.5,y:r.y-3.5,width:r.width+7,height:r.height+7}))};
    const boss=buildNavigation(inflated);assert.ok(Number.isFinite(boss.distances[50*boss.width+4]),'boss-width route must reach goal');
    const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
    for(const tile of scenery.tiles){const firstFrame=tile.firstFrame??0;assert.ok(firstFrame>=0&&atlas.sprites[tile.sprite]?.length>=firstFrame+tile.columns*tile.rows,tile.sprite);assert.ok(tile.x>=0&&tile.y>=0&&tile.x+tile.columns*4<=map.width&&tile.y+tile.rows*4<=map.height,tile.sprite+' bounds');}
    for(const prop of scenery.props)assert.ok(atlas.sprites[prop.sprite]?.length,prop.sprite);
    const source=JSON.stringify(map);map.obstacles.pop();assert.equal(JSON.stringify(campaignMap(level)),source,'map calls must be isolated');
  });
}
test('forest, snow and interior offer distinct choke layouts, not palette swaps',()=>{
  const maps=[1,2,3].map(campaignMap);
  assert.deepEqual(maps.map(m=>m.scenery!.biome),['forest','winter','interior']);
  assert.notDeepEqual(maps[0].obstacles,maps[1].obstacles);assert.notDeepEqual(maps[1].obstacles,maps[2].obstacles);
  assert.ok(maps[0].scenery!.props.length>70);assert.ok(maps[1].scenery!.props.length>50);assert.ok(maps[2].scenery!.regions.some(r=>r.sprite==='grating'));
  for(const [map,points] of [[maps[0],[[40,48],[68,44],[108,48]]],[maps[1],[[40,28],[40,68],[112,52]]],[maps[2],[[38,44],[82,58],[112,42]]]] as const)for(const [x,y]of points)assert.ok(canPlace(map,[],{x,y},1.25),`${map.id} needs clear defense site ${x},${y}`);
});
test('Pine Valley uses original vertical road cells and junction transitions',()=>{
  const tiles=campaignMap(1).scenery!.tiles;
  assert.ok(tiles.filter(tile=>tile.sprite==='forest:d03'&&tile.firstFrame===1).length>=20,'vertical road cells');
  assert.equal(tiles.filter(tile=>tile.sprite==='forest:d05').length,2,'road junction transitions');
  assert.equal(tiles.filter(tile=>tile.sprite==='forest:d10'&&tile.firstFrame!==undefined).length,32,'horizontal road cells');
});
test('trees and rocks reject tower mounting while interior wall cells support it',()=>{
  assert.equal(terrainMounts(campaignMap(1)).length,0);assert.equal(terrainMounts(campaignMap(2)).length,0);
  const map=campaignMap(3),mounts=terrainMounts(map);assert.ok(mounts.length>0);
  for(const r of mounts)assert.ok(canPlace(map,[],{x:r.x+2,y:r.y+2},1.25,mounts));
});
test('level relocation refunds deployed towers and structures, preserving research and global wave',()=>{
  const run=createRun(campaignMap(1));assert.ok(run.place('autocannon',{x:40,y:48}).ok);
  assert.ok(run.upgrade(run.model.towers[0].id,0).ok);assert.ok(run.buyStatUpgrade('damage').ok);
  const spent=run.model.towers[0].spent,before=run.model.metal,epoch=run.epoch;
  run.model.wave=10;run.model.phase='checkpoint';
  assert.ok(run.continueRun(campaignMap(2),105).ok);
  assert.equal(run.model.metal,before+spent+105);assert.equal(run.model.level,2);assert.equal(run.model.wave,10);assert.equal(run.model.statRanks.damage,1);assert.equal(run.model.towers.length,0);assert.ok(run.epoch>epoch);
  const restored=createRun(campaignMap(2));assert.ok(restored.load(run.serialize()).ok);
  assert.equal(run.continueRun(campaignMap(3),0).ok,false);
});
test('campaign saves retain scenery and accept a tower mounted on an interior wall',()=>{
  const map=campaignMap(3),run=createRun(map);run.setBuildMounts(terrainMounts(map));assert.ok(run.place('autocannon',{x:46,y:10}).ok);
  const saved=decodeDefense(JSON.stringify({version:1,map,runState:run.serialize(),spawnBaseline:map.spawn,builtWalls:[],builtWires:[],difficulty:1}));
  assert.equal(saved.map.scenery!.title,'Containment Works');assert.equal(saved.map.scenery!.props.length,map.scenery!.props.length);
});

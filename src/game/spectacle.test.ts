import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRun} from './index.ts';
import {compileTower,TOWERS,DEFAULT_MAP} from '../content/index.ts';
import {structurePlacementIssue} from './terrain.ts';
import {turretObstacles} from '../navigation/index.ts';

test('crusher is manual, recharges in combat, and cannot reset its charge by retrying',()=>{
 const run=createRun();assert.ok(run.place('crusher',{x:84,y:50}).ok);
 const gate=run.model.towers[0];assert.equal(run.slamCrushers().length,0);
 run.startWave();const [slam]=run.slamCrushers();assert.equal(slam.kind,'crush');assert.equal(slam.source,1);
 assert.equal(run.slamCrushers().length,0);assert.equal(gate.cooldown,TOWERS.crusher.cooldown);
 run.advanceCrushers(3);assert.equal(gate.cooldown,5);run.restartWave();assert.equal(gate.cooldown,5);
 run.advanceCrushers(5);assert.equal(run.slamCrushers().length,1);
 run.model.phase='preparation';run.advanceCrushers(100);assert.equal(gate.cooldown,8);
 run.startWave();assert.equal(run.slamCrushers().length,1);
});
test('crusher mouth stays open but reserves its full footprint against construction',()=>{
 const run=createRun();assert.ok(run.place('crusher',{x:84,y:50}).ok);
 const obstacles=turretObstacles(run.model.towers);assert.equal(obstacles.length,2);
 assert.ok(obstacles.every(r=>r.y>=55||r.y+r.height<=45));
 assert.equal(run.place('autocannon',{x:87,y:53}).ok,false);
 assert.ok(structurePlacementIssue(DEFAULT_MAP,run.model.towers,{x:84,y:48,width:4,height:4}));
 assert.equal(run.place('crusher',{x:1,y:1}).ok,false);
 const loaded=createRun();assert.ok(loaded.load(run.serialize()).ok);assert.equal(loaded.model.towers[0].kind,'crusher');
});
test('overload research affects only Tesla and survives saves; previous content migrates',()=>{
 const run=createRun();assert.ok(run.buyCommandUpgrade('tesla-overload').ok);
 const tower={id:1,kind:'tesla' as const,x:0,y:0,angle:0,level:0,branch:-1,cooldown:0,spent:600};
 assert.ok(compileTower(tower,[],run.model.commandUpgrades).overload);
 assert.ok(!compileTower(tower).overload);assert.ok(!compileTower({...tower,kind:'crusher'},[],run.model.commandUpgrades).overload);
 const saved=JSON.parse(run.serialize());saved.contentVersion='pressure-front-6';saved.model.unlockedTowers=saved.model.unlockedTowers?.filter((x:string)=>x!=='crusher');
 const restored=createRun();assert.ok(restored.load(JSON.stringify(saved)).ok);
 assert.ok(restored.isTowerUnlocked('crusher'));assert.ok(restored.model.commandUpgrades.includes('tesla-overload'));assert.equal(restored.model.metal,2550);
});

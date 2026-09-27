import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BASE_BARBED_WIRE_DURABILITY, BASE_FENCE_DURABILITY, BASE_WALL_DURABILITY, BASE_WALL_PRESSURE_RESISTANCE, barrierHealthAfterExplosion, explosionBarrierDamage, fenceHealthAfterPressure, wallCapacity, wallEngineeringMultiplier, wallFatigueIncrement, wallHealthAfterPressure} from './model.ts';

test('wall engineering has diminishing returns across 20 levels',()=>{
  assert.equal(wallEngineeringMultiplier(0),1);
  assert.ok(wallEngineeringMultiplier(1)-wallEngineeringMultiplier(0)>wallEngineeringMultiplier(20)-wallEngineeringMultiplier(19));
  assert.ok(wallCapacity(20)>wallCapacity(0));
});
test('walls only fatigue under meaningful contacted pressure',()=>{
  assert.equal(BASE_WALL_DURABILITY,1_800);
  assert.equal(BASE_FENCE_DURABILITY,120);
  assert.equal(BASE_BARBED_WIRE_DURABILITY,350);
  assert.equal(BASE_WALL_PRESSURE_RESISTANCE,14);
  assert.equal(wallCapacity(0),BASE_WALL_DURABILITY);
  assert.equal(wallFatigueIncrement(BASE_WALL_PRESSURE_RESISTANCE,1,1,0),0);
  assert.equal(wallFatigueIncrement(80,0,1,0),0);
  assert.ok(wallFatigueIncrement(100,1,1,0)>wallFatigueIncrement(100,1,1,10));
  assert.equal(wallHealthAfterPressure(1,100,1,10,0),0);
});
test('base walls visibly fatigue under a sustained crush without failing instantly',()=>{
  const afterTenSeconds=wallHealthAfterPressure(wallCapacity(0),100,1,10,0);
  assert.ok(afterTenSeconds<wallCapacity(0)&&afterTenSeconds>0);
  assert.equal(wallHealthAfterPressure(wallCapacity(0),200,1,20,0),0);
});
test('chain-link fencing weakens and folds under sustained pressure',()=>{
  assert.equal(BASE_FENCE_DURABILITY,120);
  assert.equal(fenceHealthAfterPressure(BASE_FENCE_DURABILITY,8,1,1),BASE_FENCE_DURABILITY);
  assert.ok(fenceHealthAfterPressure(BASE_FENCE_DURABILITY,100,1,1)<BASE_FENCE_DURABILITY);
});
test('friendly explosions lightly damage chain-link and barbed wire',()=>{
  assert.ok(explosionBarrierDamage(BASE_FENCE_DURABILITY,0,5)>0);
  assert.equal(explosionBarrierDamage(BASE_FENCE_DURABILITY,5,5),0);
  assert.ok(explosionBarrierDamage(BASE_BARBED_WIRE_DURABILITY,0,5)<BASE_BARBED_WIRE_DURABILITY*.03);
  assert.equal(barrierHealthAfterExplosion(120,120,0,5),117);
});

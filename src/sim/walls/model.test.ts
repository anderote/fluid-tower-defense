import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BASE_WALL_DURABILITY, BASE_WALL_PRESSURE_RESISTANCE, wallCapacity, wallEngineeringMultiplier, wallFatigueIncrement, wallHealthAfterPressure} from './model.ts';

test('wall engineering has diminishing returns across 20 levels',()=>{
  assert.equal(wallEngineeringMultiplier(0),1);
  assert.ok(wallEngineeringMultiplier(1)-wallEngineeringMultiplier(0)>wallEngineeringMultiplier(20)-wallEngineeringMultiplier(19));
  assert.ok(wallCapacity(20)>wallCapacity(0));
});
test('walls only fatigue under meaningful contacted pressure',()=>{
  assert.equal(wallCapacity(0),BASE_WALL_DURABILITY);
  assert.equal(wallFatigueIncrement(BASE_WALL_PRESSURE_RESISTANCE,1,1,0),0);
  assert.equal(wallFatigueIncrement(80,0,1,0),0);
  assert.ok(wallFatigueIncrement(80,1,1,0)>wallFatigueIncrement(80,1,1,10));
  assert.equal(wallHealthAfterPressure(1,100,1,10,0),0);
});
test('base walls survive sustained pressure that previously destroyed them immediately',()=>{
  const afterTenSeconds=wallHealthAfterPressure(wallCapacity(0),100,1,10,0);
  assert.ok(afterTenSeconds>wallCapacity(0)*.9);
  assert.ok(wallHealthAfterPressure(wallCapacity(0),200,1,10,0)<wallCapacity(0));
});

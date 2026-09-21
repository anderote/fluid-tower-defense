import test from 'node:test';
import assert from 'node:assert/strict';
import {corpseMass,corpseSpeedMultiplier,decayCorpseMass,erodeCorpseMass} from './corpse-field.ts';

test('larger and heavy zombie corpses build taller barriers',()=>{
  assert.ok(corpseMass(.5,2)>corpseMass(.22,0));
  assert.ok(corpseMass(.4,4)>corpseMass(.4,1));
});

test('corpse terrain slows continuously and retains a traversable floor',()=>{
  assert.equal(corpseSpeedMultiplier(0),1);
  assert.ok(corpseSpeedMultiplier(2)<corpseSpeedMultiplier(.5));
  assert.equal(corpseSpeedMultiplier(1e6),.28);
});

test('corpse terrain decays and blasts excavate it without making negative mass',()=>{
  assert.ok(decayCorpseMass(2,1)<2);
  assert.equal(decayCorpseMass(.005,1),0);
  assert.ok(erodeCorpseMass(2,.25)<2);
  assert.equal(erodeCorpseMass(1,1),0);
});

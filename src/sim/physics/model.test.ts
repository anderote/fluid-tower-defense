import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exposureIncrement,
  MAX_BODY_RADIUS,
  occupiedArea,
  packingContribution,
  pressureDamageRate,
  pressureForPacking,
} from './model.ts';

test('packing is based on occupied area rather than mass', () => {
  const small = packingContribution(0.2, 0.25);
  const large = packingContribution(0.4, 0.25);
  assert.ok(Math.abs(large / small - 4) < 1e-12);
  assert.ok(Math.abs(occupiedArea(0.4) / occupiedArea(0.2) - 4) < 1e-12);
  assert.ok(Number.isFinite(occupiedArea(Number.NaN)));
  assert.equal(MAX_BODY_RADIUS, 0.85);
  assert.ok(Math.abs(occupiedArea(MAX_BODY_RADIUS) - Math.PI * 0.85 ** 2) < 1e-12);
});

test('pressure has no attractive branch below comfortable packing', () => {
  assert.equal(pressureForPacking(0, 36), 0);
  assert.equal(pressureForPacking(1, 36), 0);
  assert.ok(pressureForPacking(1.2, 36) > 0);
});

test('pressure damage ramps smoothly to the full crush rate', () => {
  assert.equal(pressureDamageRate(23, 24, 96, 18), 0);
  assert.equal(pressureDamageRate(24, 24, 96, 18), 0);
  assert.equal(pressureDamageRate(60, 24, 96, 18), 9);
  assert.equal(pressureDamageRate(96, 24, 96, 18), 18);
  assert.equal(pressureDamageRate(200, 24, 96, 18), 18);
});

test('pressure exposure converges across substeps', () => {
  const oneStep = exposureIncrement(60, 24, 96, 18, 1 / 60);
  const twoSteps = 2 * exposureIncrement(60, 24, 96, 18, 1 / 120);
  assert.ok(Math.abs(oneStep - twoSteps) < 1e-12);
});

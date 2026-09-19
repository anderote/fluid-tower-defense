import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exposureIncrement,
  occupiedArea,
  packingContribution,
  pressureForPacking,
} from './model.ts';

test('packing is based on occupied area rather than mass', () => {
  const small = packingContribution(0.2, 0.25);
  const large = packingContribution(0.4, 0.25);
  assert.ok(Math.abs(large / small - 4) < 1e-12);
  assert.ok(Math.abs(occupiedArea(0.4) / occupiedArea(0.2) - 4) < 1e-12);
});

test('pressure has no attractive branch below comfortable packing', () => {
  assert.equal(pressureForPacking(0, 36), 0);
  assert.equal(pressureForPacking(1, 36), 0);
  assert.ok(pressureForPacking(1.2, 36) > 0);
});

test('exposure is zero below threshold and converges across substeps', () => {
  assert.equal(exposureIncrement(1.7, 1.8, 18, 1 / 60), 0);
  const oneStep = exposureIncrement(2.1, 1.8, 18, 1 / 60);
  const twoSteps = 2 * exposureIncrement(2.1, 1.8, 18, 1 / 120);
  assert.ok(Math.abs(oneStep - twoSteps) < 1e-12);
});


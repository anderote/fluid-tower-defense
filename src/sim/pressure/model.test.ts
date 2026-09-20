import assert from 'node:assert/strict';
import test from 'node:test';
import {formatPressure,pressureKpa,scaledPeakPressure} from './model.ts';
import {TOWERS} from '../../content/index.ts';

test('pressure readouts choose kPa and MPa without changing the crowd scale',()=>{
  assert.equal(pressureKpa(126),126);
  assert.equal(formatPressure(126),'126 kPa');
  assert.equal(formatPressure(126_000),'126 MPa');
  assert.equal(formatPressure(1250),'1.25 MPa');
});

test('weapon pressure follows damage and impulse upgrades',()=>{
  const base=TOWERS.repulsor;
  assert.equal(scaledPeakPressure(base,base.damage,base.force),base.peakPressureKpa);
  assert.ok(scaledPeakPressure(base,base.damage*2,base.force*2)>base.peakPressureKpa);
});


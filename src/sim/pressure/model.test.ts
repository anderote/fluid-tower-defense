import assert from 'node:assert/strict';
import test from 'node:test';
import {blastPressureFalloff,blastPressureKpa,formatPressure,pressureKpa,scaledPeakPressure} from './model.ts';
import {TOWERS} from '../../content/index.ts';

test('pressure readouts choose kPa and MPa without changing the crowd scale',()=>{
  assert.equal(pressureKpa(126),126);
  assert.equal(formatPressure(126),'126 kPa');
  assert.equal(formatPressure(126_000),'126 MPa');
  assert.equal(formatPressure(1250),'1.25 MPa');
});

test('blast pressure uses a finite-core inverse-radius falloff',()=>{
  assert.equal(blastPressureFalloff(0,10),1);
  assert.equal(blastPressureFalloff(2,10),1);
  assert.equal(blastPressureFalloff(4,10),.5);
  assert.equal(blastPressureFalloff(8,10),.25);
  assert.equal(blastPressureFalloff(10,10),0);
  assert.ok(blastPressureFalloff(9,10)<blastPressureFalloff(8,10));
  assert.equal(blastPressureKpa(1600,4,10),800);
});

test('weapon pressure follows damage and impulse upgrades',()=>{
  const base=TOWERS.repulsor;
  assert.equal(scaledPeakPressure(base,base.damage,base.force),base.peakPressureKpa);
  assert.ok(scaledPeakPressure(base,base.damage*2,base.force*2)>base.peakPressureKpa);
});

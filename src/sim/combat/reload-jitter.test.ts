import assert from 'node:assert/strict';
import test from 'node:test';
import {RELOAD_JITTER,RELOAD_VARIANCE,reloadMultiplier} from './index.ts';

test('reload jitter is stable, stays within 15%, and separates identical towers',()=>{
  assert.equal(RELOAD_JITTER,.15);
  const first=reloadMultiplier(1,1,RELOAD_VARIANCE.tesla);
  assert.equal(reloadMultiplier(1,1,RELOAD_VARIANCE.tesla),first);
  assert.notEqual(reloadMultiplier(1,2,RELOAD_VARIANCE.tesla),first);
  assert.notEqual(reloadMultiplier(2,1,RELOAD_VARIANCE.tesla),first);
  assert.ok(RELOAD_VARIANCE.autocannon<RELOAD_VARIANCE.mortar);
  assert.ok(RELOAD_VARIANCE.mortar<RELOAD_VARIANCE.rocket);
  assert.ok(RELOAD_VARIANCE.rocket<=RELOAD_VARIANCE.railgun);
  assert.equal(RELOAD_VARIANCE.tesla,RELOAD_JITTER);
  for(const [kind,variance] of Object.entries(RELOAD_VARIANCE))for(let towerId=1;towerId<=64;towerId++)for(let shot=1;shot<=100;shot++){
    const multiplier=reloadMultiplier(towerId,shot,variance);
    assert.ok(multiplier>=1-variance&&multiplier<=1+variance,`${kind}: out-of-range multiplier ${multiplier}`);
  }
});

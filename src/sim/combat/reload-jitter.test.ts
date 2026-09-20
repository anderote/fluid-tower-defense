import assert from 'node:assert/strict';
import test from 'node:test';
import {RELOAD_JITTER,reloadMultiplier} from './index.ts';

test('reload jitter is stable, light, and separates identical towers',()=>{
  const first=reloadMultiplier(1,1);
  assert.equal(reloadMultiplier(1,1),first);
  assert.notEqual(reloadMultiplier(2,1),first);
  for(let towerId=1;towerId<=64;towerId++)for(let shot=1;shot<=100;shot++){
    const multiplier=reloadMultiplier(towerId,shot);
    assert.ok(multiplier>=1-RELOAD_JITTER&&multiplier<=1+RELOAD_JITTER,`out-of-range multiplier ${multiplier}`);
  }
});

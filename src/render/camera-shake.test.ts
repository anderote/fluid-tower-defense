import assert from 'node:assert/strict';
import test from 'node:test';
import {explosionShakeScale} from './index.ts';

test('explosion camera shake tapers smoothly out of the wide tactical view',()=>{
  assert.equal(explosionShakeScale(1),0);
  assert.equal(explosionShakeScale(1.15),0);
  assert.ok(explosionShakeScale(2)>0&&explosionShakeScale(2)<.5);
  assert.ok(explosionShakeScale(3)>explosionShakeScale(2));
  assert.equal(explosionShakeScale(3.25),1);
  assert.equal(explosionShakeScale(5),1);
});

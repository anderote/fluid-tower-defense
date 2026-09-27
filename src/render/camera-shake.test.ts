import assert from 'node:assert/strict';
import test from 'node:test';
import {explosionShakeScale} from './index.ts';

test('explosion camera shake tapers smoothly out of the wide tactical view',()=>{
  assert.equal(explosionShakeScale(1),0);
  assert.equal(explosionShakeScale(1.15),0);
  assert.ok(explosionShakeScale(2)>0&&explosionShakeScale(2)<.15);
  assert.ok(explosionShakeScale(3)>explosionShakeScale(2)&&explosionShakeScale(3)<.35);
  assert.ok(explosionShakeScale(5)<.7);
  assert.ok(explosionShakeScale(8)>.7);
  assert.ok(explosionShakeScale(10)>.9);
  assert.equal(explosionShakeScale(12),1);
});

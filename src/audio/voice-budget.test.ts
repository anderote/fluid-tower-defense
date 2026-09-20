import assert from 'node:assert/strict';
import test from 'node:test';
import {AudioVoiceBudget} from './voice-budget.ts';

test('isolated sounds pass unchanged while same-group bursts are spaced',()=>{
  const budget=new AudioVoiceBudget();
  assert.equal(budget.admit('light',0,.08),true);
  assert.equal(budget.admit('light',.01,.08),false);
  assert.equal(budget.admit('light',.05,.08),true);
});

test('expired voices release capacity',()=>{
  const budget=new AudioVoiceBudget();
  assert.equal(budget.admit('sustained',0,.2),true);
  assert.equal(budget.admit('sustained',.09,.2),true);
  assert.equal(budget.admit('sustained',.18,.2),false);
  assert.equal(budget.admit('sustained',.29,.2),true);
});

test('heavy impacts retain headroom during dense light fire',()=>{
  const budget=new AudioVoiceBudget();
  for(let index=0;index<6;index++)budget.admit(index%2?'detail':'light',index*.065,1);
  assert.equal(budget.admit('light',.5,.1),false);
  assert.equal(budget.admit('impact',.5,.4),true);
  assert.equal(budget.admit('heavy',.5,.2),true);
});

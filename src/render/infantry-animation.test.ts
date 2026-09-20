import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInfantryAnimator,classicInfantryFacing,infantryFacing,infantryMuzzle,INFANTRY_ATTACK,INFANTRY_DEATH} from './infantry-animation.ts';
import {infantryStats,type Soldier} from '../infantry/model.ts';
const soldier=():Soldier=>({id:1,home:1,x:10,y:10,quality:0,health:40,cooldown:0,angle:0,flash:0,walk:0,dead:0});

test('classic cardinal facings map to east, south, west and north without mirroring',()=>{
  assert.deepEqual([0,Math.PI/2,Math.PI,-Math.PI/2].map(a=>classicInfantryFacing(infantryFacing(a))),[6,4,2,0]);
  assert.equal(infantryFacing(2*Math.PI),0);
});
test('walking follows displacement, stops at rest and freezes when paused',()=>{
  const animate=createInfantryAnimator(),s=soldier();assert.equal(animate.prepare([s],0)[0].frame,0);
  s.x+=.3;const walking=animate.prepare([s],.1)[0];assert.ok(walking.moving);assert.ok(walking.frame>=1&&walking.frame<INFANTRY_ATTACK);
  assert.deepEqual(animate.prepare([s],.1)[0],walking);
  assert.equal(animate.prepare([s],.2)[0].frame,0);
  s.x+=20;assert.equal(animate.prepare([s],.3)[0].moving,false,'teleports must not sprint through animation frames');
});
test('rifle firing animates past the short muzzle flash and returns to idle during reload',()=>{
  const animate=createInfantryAnimator(),s=soldier();s.cooldown=.8;s.flash=.1;
  assert.equal(animate.prepare([s],0)[0].frame,INFANTRY_ATTACK);
  s.cooldown=.6;s.flash=0;assert.ok(animate.prepare([s],.2)[0].frame>INFANTRY_ATTACK);
  s.cooldown=.1;assert.equal(animate.prepare([s],.7)[0].frame,0);
});
test('all troop roles collapse to a held final frame and fade without looping',()=>{
  for(const kind of ['rifle','rocket','flame','samurai'] as const){
    const animate=createInfantryAnimator(),s={...soldier(),kind,health:0};
    assert.equal(animate.prepare([s],0)[0].frame,INFANTRY_DEATH);
    s.dead=.8;const fallen=animate.prepare([s],.8)[0];assert.equal(fallen.frame,INFANTRY_DEATH+7);assert.equal(fallen.alpha,1);
    s.dead=2.6;assert.ok(Math.abs(animate.prepare([s],2.6)[0].alpha-.5)<1e-6);
    s.dead=3;assert.equal(animate.prepare([s],3)[0].alpha,0);
  }
});
test('animation does not mutate model/save data, including upgraded weapon timing',()=>{
  const s={...soldier(),quality:5};s.cooldown=infantryStats('rifle',5).cooldown;
  const before=structuredClone(s);createInfantryAnimator().prepare([s],1);assert.deepEqual(s,before);
  const muzzle=infantryMuzzle({...s,angle:Math.PI/2});assert.ok(Math.abs(muzzle.x-s.x)<1e-6);assert.ok(muzzle.y<s.y);
});

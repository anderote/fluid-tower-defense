import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInfantryAnimator,classicInfantryFacing,classicDogFrame,infantryCasing,infantryFacing,infantryMuzzle,attackFrames,samuraiSlashPhase,SAMURAI_ATTACK_DURATION,INFANTRY_ATTACK,INFANTRY_DEATH} from './infantry-animation.ts';
import {readFileSync} from 'node:fs';
import {infantryStats,type Soldier} from '../infantry/model.ts';
const soldier=():Soldier=>({id:1,home:1,x:10,y:10,quality:0,health:40,cooldown:0,angle:0,flash:0,walk:0,dead:0});

test('classic cardinal facings map to east, south, west and north without mirroring',()=>{
  assert.deepEqual([0,Math.PI/2,Math.PI,-Math.PI/2].map(a=>classicInfantryFacing(infantryFacing(a))),[6,4,2,0]);
  assert.equal(infantryFacing(2*Math.PI),0);
});
test('rifles eject fading ballistic brass while non-casing weapons do not',()=>{
  const rifle={...soldier(),kind:'rifle' as const,attackAge:.1},early=infantryCasing(rifle),late=infantryCasing({...rifle,attackAge:.6});assert.ok(early&&late);assert.ok(late.y>early.y);assert.ok(late.alpha<early.alpha);
  assert.equal(infantryCasing({...rifle,kind:'rocket'}),undefined);assert.equal(infantryCasing({...rifle,attackAge:.8}),undefined);
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
test('samurai sword animation uses all attack slots with anticipation, cut, and follow-through',()=>{
  assert.equal(attackFrames('samurai'),16);
  assert.deepEqual(samuraiSlashPhase(0),{progress:0,anticipation:0,cut:0,followThrough:0});
  const cut=samuraiSlashPhase(SAMURAI_ATTACK_DURATION*.4);assert.equal(cut.anticipation,1);assert.ok(cut.cut>0&&cut.cut<1);assert.equal(cut.followThrough,0);
  const follow=samuraiSlashPhase(SAMURAI_ATTACK_DURATION*.8);assert.equal(follow.cut,1);assert.ok(follow.followThrough>0);
  const animate=createInfantryAnimator(),s={...soldier(),kind:'samurai' as const,cooldown:.9,flash:.28};
  assert.equal(animate.prepare([s],0)[0].frame,INFANTRY_ATTACK);
  s.flash=0;s.cooldown=.5;assert.ok(animate.prepare([s],.4)[0].frame>=INFANTRY_ATTACK+7);
  s.cooldown=.1;assert.equal(animate.prepare([s],.8)[0].frame,0);
});
test('all troop roles collapse to a held final frame and fade without looping',()=>{
  for(const kind of ['rifle','rocket','flame','samurai','dog','phalanx'] as const){
    const animate=createInfantryAnimator(),s={...soldier(),kind,health:0};
    assert.equal(animate.prepare([s],0)[0].frame,INFANTRY_DEATH);
    s.dead=.8;const fallen=animate.prepare([s],.8)[0];assert.equal(fallen.frame,INFANTRY_DEATH+7);assert.equal(fallen.alpha,1);
    s.dead=2.6;assert.ok(Math.abs(animate.prepare([s],2.6)[0].alpha-.5)<1e-6);
    s.dead=3;assert.equal(animate.prepare([s],3)[0].alpha,0);
  }
});
test('all dog poses use existing original dog and pounce frames',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
 for(let facing=0;facing<8;facing++)for(let frame=0;frame<31;frame++){const pose=classicDogFrame(facing,frame);assert.ok(atlas.sprites[pose.sprite][pose.frame]!==undefined);}
 assert.equal(classicDogFrame(0,0).frame,6);assert.equal(classicDogFrame(0,INFANTRY_ATTACK).sprite,'dogbullt');assert.equal(classicDogFrame(0,30).frame,241);assert.ok(atlas.sprites.kenn.length>=2);
});
test('animation does not mutate model/save data, including upgraded weapon timing',()=>{
  const s={...soldier(),quality:5};s.cooldown=infantryStats('rifle',5).cooldown;
  const before=structuredClone(s);createInfantryAnimator().prepare([s],1);assert.deepEqual(s,before);
  const muzzle=infantryMuzzle({...s,angle:Math.PI/2});assert.ok(Math.abs(muzzle.x-s.x)<1e-6);assert.ok(muzzle.y<s.y);
});

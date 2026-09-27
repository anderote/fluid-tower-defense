import {test} from 'node:test';import assert from 'node:assert/strict';import {FixedClock} from '../src/runtime/clock.ts';
test('fixed clock conserves time at 120Hz and bounds background catch-up',()=>{const c=new FixedClock();let steps=0;for(let i=0;i<120;i++)steps+=c.advance(1/120,false);assert.equal(steps,60);assert.equal(c.advance(60,false),3);});
test('pause drops residual time and reset clears ticks',()=>{const c=new FixedClock();c.advance(.01,false);assert.equal(c.advance(1,true),0);assert.equal(c.advance(.01,false),0);c.tick=42;c.reset();assert.equal(c.tick,0);});

test('all speed presets multiply simulated time while retaining fixed physics steps',()=>{
 for(const speed of [1,2,3,5])for(const fps of [30,60,120]){
  const clock=new FixedClock();let ticks=0;
  for(let frame=0;frame<fps;frame++)ticks+=clock.advance(1/fps,false,speed);
  assert.equal(ticks,60*speed);assert.equal(clock.step,1/60);
  assert.equal(clock.advance(60,false,speed),3*speed,'background catch-up remains bounded');
 }
});
test('pausing at accelerated speed discards catch-up and speed changes take effect immediately',()=>{
 const clock=new FixedClock();assert.equal(clock.advance(1/60,false,5),5);
 assert.equal(clock.advance(5,true,5),0);assert.equal(clock.advance(1/60,false,2),2);
 assert.equal(clock.advance(1/60,false,1),1);assert.equal(clock.advance(1/60,false,99),1);
});

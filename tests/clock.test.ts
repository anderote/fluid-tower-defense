import {test} from 'node:test';import assert from 'node:assert/strict';import {FixedClock} from '../src/runtime/clock.ts';
test('fixed clock conserves time at 120Hz and bounds background catch-up',()=>{const c=new FixedClock();let steps=0;for(let i=0;i<120;i++)steps+=c.advance(1/120,false);assert.equal(steps,60);assert.equal(c.advance(60,false),3);});
test('pause drops residual time and reset clears ticks',()=>{const c=new FixedClock();c.advance(.01,false);assert.equal(c.advance(1,true),0);assert.equal(c.advance(.01,false),0);c.tick=42;c.reset();assert.equal(c.tick,0);});

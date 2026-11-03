import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchInput} from './touch-input.ts';
function fixture(draw=false){const calls:string[]=[];const input=new TouchInput({tap:()=>calls.push('tap'),draw:()=>calls.push('draw'),pan:()=>calls.push('pan'),zoom:()=>calls.push('zoom'),canDraw:()=>draw});return {input,calls};}
test('a touch tap commits exactly once on release',()=>{const {input,calls}=fixture();input.down(1,{x:10,y:10});assert.deepEqual(calls,[]);input.up(1,{x:10,y:10});assert.deepEqual(calls,['tap']);});
test('dragging pans without placing a defense',()=>{const {input,calls}=fixture();input.down(1,{x:10,y:10});input.move(1,{x:40,y:10});input.up(1,{x:40,y:10});assert.deepEqual(calls,['pan']);});
test('barrier and selection drags commit a path',()=>{const {input,calls}=fixture(true);input.down(1,{x:10,y:10});input.move(1,{x:40,y:10});input.up(1,{x:40,y:10});assert.deepEqual(calls,['draw']);});
test('pinch cancels pending placement even after the first finger lifts',()=>{const {input,calls}=fixture(true);input.down(1,{x:10,y:10});input.down(2,{x:50,y:10});input.move(2,{x:80,y:10});input.up(2,{x:80,y:10});input.move(1,{x:20,y:10});input.up(1,{x:20,y:10});assert.deepEqual(calls,['pan','zoom']);});
test('interrupted gesture never commits',()=>{const {input,calls}=fixture(true);input.down(1,{x:10,y:10});input.cancel();input.up(1,{x:10,y:10});assert.deepEqual(calls,[]);});

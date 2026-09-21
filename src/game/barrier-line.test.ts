import assert from 'node:assert/strict';
import test from 'node:test';
import {barrierLine} from './barrier-line.ts';

const cell=(x:number,y:number)=>({x,y,width:2,height:2});

test('barrier drag previews every snapped cell from press through release',()=>{
  assert.deepEqual(barrierLine(cell(4,6),cell(10,6)),[cell(4,6),cell(6,6),cell(8,6),cell(10,6)]);
  assert.deepEqual(barrierLine(cell(8,10),cell(8,4)),[cell(8,10),cell(8,8),cell(8,6),cell(8,4)]);
});

test('barrier drag locks to its dominant axis so every preview section connects',()=>{
  assert.deepEqual(barrierLine(cell(2,2),cell(10,6)),[cell(2,2),cell(4,2),cell(6,2),cell(8,2),cell(10,2)]);
  assert.deepEqual(barrierLine(cell(10,10),cell(6,2)),[cell(10,10),cell(10,8),cell(10,6),cell(10,4),cell(10,2)]);
});

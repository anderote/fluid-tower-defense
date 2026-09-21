import assert from 'node:assert/strict';
import test from 'node:test';
import {barrierCost,barrierLength,barrierSegments,sampleBarrier,simplifyBarrier} from './barrier-path.ts';

test('straight barriers retain an arbitrary-angle centerline while their collision samples remain compact',()=>{
 const points=[{x:2,y:3},{x:11,y:9}],segments=barrierSegments('fence',7,points);
 assert.ok(segments.length>10);
 assert.deepEqual(segments[0].from,points[0]);assert.deepEqual(segments.at(-1)!.to,points[1]);
 assert.ok(segments.every(segment=>segment.width<1.5&&segment.height<1.5));
});

test('diagonal fence collision tiles stay centered with equal clearance on either side',()=>{
 const segments=barrierSegments('fence',7,[{x:2,y:2},{x:8,y:8}]);
 const expected=.72/Math.sqrt(2);
 for(const segment of segments){
  const center={x:segment.x+segment.width/2,y:segment.y+segment.height/2};
  assert.ok(Math.abs(center.x-center.y)<.000001);
  assert.ok(Math.abs(segment.width-expected)<.000001);
  assert.equal(segment.width,segment.height);
 }
});

test('freeform barriers charge one panel price per five world units',()=>{
 assert.equal(barrierCost(5,45),45);assert.equal(barrierCost(5.01,45),90);
});

test('freehand wire is distance-sampled and removes redundant straight samples',()=>{
 const sampled=sampleBarrier([{x:0,y:0}],{x:3,y:0},.5),simplified=simplifyBarrier(sampled);
 assert.ok(sampled.length>4);assert.deepEqual(simplified,[{x:0,y:0},{x:3,y:0}]);assert.equal(barrierLength(simplified),3);
});

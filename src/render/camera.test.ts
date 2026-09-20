import assert from 'node:assert/strict';
import {test} from 'node:test';
import {screenToWorld,worldToScreen} from './camera.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('world corners match the rendered rectangle, with y increasing down the screen',()=>{
 const viewport={left:10,top:20,width:1600,height:1000},camera={x:0,y:0,zoom:1};
 assert.deepEqual(worldToScreen({x:0,y:0},viewport,camera),{x:10,y:20});
 assert.deepEqual(worldToScreen({x:160,y:100},viewport,camera),{x:1610,y:1020});
 assert.deepEqual(worldToScreen({x:80,y:50},viewport,camera),{x:810,y:520});
});
test('screen and world projection round-trip at wide/tall aspect ratios, zoom and pan',()=>{
 for(const [width,height] of [[1600,1000],[400,1000],[2000,400]])for(const camera of [{x:0,y:0,zoom:1},{x:35,y:20,zoom:2},{x:100,y:60,zoom:5}]){
  const viewport={left:17,top:83,width,height};
  for(const point of [{x:0,y:0},{x:40,y:50},{x:160,y:100}]){
   const restored=screenToWorld(worldToScreen(point,viewport,camera),viewport,camera);
   close(restored.x,point.x);close(restored.y,point.y);
  }
 }
});
test('letterboxing is centered and off-world input clamps to world bounds',()=>{
 const camera={x:0,y:0,zoom:1},viewport={left:0,top:0,width:2000,height:1000};
 close(worldToScreen({x:0,y:0},viewport,camera).x,200);
 close(worldToScreen({x:0,y:0},viewport,camera).y,0);
 assert.deepEqual(screenToWorld({x:-100,y:-100},viewport,camera),{x:0,y:0});
 assert.deepEqual(screenToWorld({x:3000,y:2000},viewport,camera),{x:160,y:100});
});

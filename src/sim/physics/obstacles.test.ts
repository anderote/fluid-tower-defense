import test from 'node:test';
import assert from 'node:assert/strict';
import {OBSTACLE_CELL,OBSTACLE_PADDING,packObstacleGrid,sameObstacles} from './obstacles.ts';
test('obstacle broad phase conservatively includes nearby thin, long, corner and offscreen walls in original order',()=>{
 const walls=[{x:10,y:0,width:.1,height:100},{x:0,y:50,width:160,height:.2},{x:-8,y:3,width:3,height:3},{x:13,y:48,width:8,height:8}];
 const grid=packObstacleGrid(walls,160,100,16);
 for(let y=.1;y<100;y+=1.7)for(let x=-15.9;x<160;x+=1.3){
  const cell=Math.floor(y/OBSTACLE_CELL)*grid.columns+Math.floor((x+16)/OBSTACLE_CELL),offset=(walls.length+cell)*4,start=grid.data[offset],length=grid.data[offset+1];
  const ids=Array.from({length},(_,j)=>grid.data[(start+j)*4]);assert.deepEqual(ids,[...ids].sort((a,b)=>a-b));
  walls.forEach((r,i)=>{if(x>=r.x-OBSTACLE_PADDING&&x<=r.x+r.width+OBSTACLE_PADDING&&y>=r.y-OBSTACLE_PADDING&&y<=r.y+r.height+OBSTACLE_PADDING)assert.ok(ids.includes(i),`missing ${i} at ${x},${y}`);});
 }
});
test('geometry cache detects edits and respects GPU float precision',()=>{
 const walls=[{x:.1,y:2,width:3,height:4}],packed=packObstacleGrid(walls,16,16,0).data.slice(0,4);
 assert.ok(sameObstacles(packed,walls));assert.ok(!sameObstacles(packed,[{...walls[0],width:5}]));assert.ok(!sameObstacles(packed,[]));
});

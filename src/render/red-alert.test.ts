import assert from 'node:assert/strict';
import test from 'node:test';
import {redAlertFacing,wallTiles} from './red-alert.ts';

test('original gun facings point toward the target in all four quadrants and wrap',()=>{
  assert.equal(redAlertFacing(0),24);
  assert.equal(redAlertFacing(-Math.PI/2),0);
  assert.equal(redAlertFacing(Math.PI),8);
  assert.equal(redAlertFacing(Math.PI/2),16);
  assert.equal(redAlertFacing(2*Math.PI),24);
  assert.equal(redAlertFacing(-2*Math.PI),24);
});
test('adjacent walls suppress internal faces and expose a new end after demolition',()=>{
  const first={x:4,y:4,width:4,height:4},second={x:4,y:8,width:4,height:4};
  const joined=wallTiles([first,second]);
  assert.equal(joined[0].south,false);
  assert.equal(joined[1].south,true);
  assert.equal(wallTiles([first])[0].south,true);
  assert.equal(wallTiles([first,{x:8,y:4,width:4,height:4}])[0].east,false);
});
test('wall tiles preserve partial authored bounds and deduplicate overlapping grid cells',()=>{
  const tiles=wallTiles([{x:3,y:2,width:6,height:7}]);
  assert.equal(tiles.reduce((area,t)=>area+t.width*t.height,0),42);
  assert.ok(tiles.every(t=>t.x>=3&&t.y>=2&&t.x+t.width<=9&&t.y+t.height<=9));
  assert.equal(wallTiles([{x:0,y:0,width:8,height:4},{x:4,y:0,width:4,height:4}]).length,2);
});

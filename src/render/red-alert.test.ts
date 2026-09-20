import assert from 'node:assert/strict';
import test from 'node:test';
import {redAlertFacing,wallTiles,floorSprites} from './red-alert.ts';
import {readFileSync} from 'node:fs';

test('grating is opt-in and an older atlas safely retains the panel floor',()=>{
  const floor=[0,1],grating=[2,3];
  assert.equal(floorSprites({floor,grating}),floor);
  assert.equal(floorSprites({floor,grating},'grating'),grating);
  assert.equal(floorSprites({floor},'grating'),floor);
  assert.equal(floorSprites({floor,grating:[]},'grating'),floor);
});
test('the steel grating preview contains all thirteen original floor frames at native scale',()=>{
  const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
  assert.equal(atlas.sprites.grating.length,13);
  for(const id of atlas.sprites.grating){const f=atlas.frames[id];assert.equal(f.width,24);assert.equal(f.height,24);assert.ok(f.x+24<=atlas.size&&f.y+24<=atlas.size);}
});

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

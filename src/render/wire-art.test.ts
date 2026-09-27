import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fencePanels,wireTiles,wireDamage,type WireState} from './wire-art.ts';
const wire=(x:number,y:number,extra:Partial<WireState>={}):WireState=>({x,y,width:4,height:4,health:100,maxHealth:100,breached:false,...extra});

test('wire atlas masks cover all sixteen cardinal neighbor combinations',()=>{
  const neighbors=[wire(8,4),wire(12,8),wire(8,12),wire(4,8)];
  for(let mask=0;mask<16;mask++){
    const tiles=wireTiles([wire(8,8),...neighbors.filter((_,i)=>mask&(1<<i))]);
    assert.equal(tiles[0].mask,mask);
  }
});
test('horizontal and vertical runs connect without rotating the sprite lighting',()=>{
  assert.deepEqual(wireTiles([wire(0,0),wire(4,0),wire(8,0)]).map(t=>t.mask),[2,10,8]);
  assert.deepEqual(wireTiles([wire(0,0),wire(0,4),wire(0,8)]).map(t=>t.mask),[4,5,1]);
});
test('half-tile wire segments connect on the dense 2 x 2 grid',()=>{
  const half=(x:number,y:number)=>wire(x,y,{width:2,height:2});
  assert.deepEqual(wireTiles([half(0,0),half(2,0),half(4,0)]).map(tile=>({x:tile.x,width:tile.width,mask:tile.mask})),[
    {x:0,width:2,mask:2},{x:2,width:2,mask:10},{x:4,width:2,mask:8},
  ]);
});
test('a breach disconnects live neighbors while preserving debris orientation',()=>{
  const source=[wire(0,0),wire(4,0,{health:0,breached:true}),wire(8,0)];
  const snapshot=JSON.stringify(source),tiles=wireTiles(source);
  assert.deepEqual(tiles.map(t=>t.mask),[0,10,0]);
  assert.equal(tiles[1].debrisMask,10);assert.equal(tiles[1].damage,'breached');
  assert.equal(JSON.stringify(source),snapshot);
  source[1].breached=false;source[1].health=100;
  assert.deepEqual(wireTiles(source).map(t=>t.mask),[2,10,8]);
});
test('damage stages do not visually breach a still-solid wire',()=>{
  for(const [health,stage] of [[100,'intact'],[71,'intact'],[70,'worn'],[36,'worn'],[35,'frayed'],[0,'frayed']] as const)
    assert.equal(wireDamage(wire(0,0,{health})),stage);
  assert.equal(wireDamage(wire(0,0,{health:0,breached:true})),'breached');
  assert.equal(wireDamage(wire(0,0,{maxHealth:0})),'frayed');
});
test('wire tiling preserves nonstandard saved footprints and connects internal cells',()=>{
  const tiles=wireTiles([wire(3,2,{width:10,height:7})]);
  assert.equal(tiles.length,6);assert.equal(tiles.reduce((sum,t)=>sum+t.width*t.height,0),70);
  assert.equal(tiles[0].mask,6);
  assert.ok(tiles.every(t=>t.x>=3&&t.y>=2&&t.x+t.width<=13&&t.y+t.height<=9));
});
test('placement preview connects to live wires without duplicating occupied tiles or mutating them',()=>{
  const existing=[wire(0,0),wire(8,0)],preview=wire(4,0);
  assert.deepEqual(wireTiles([preview],[...existing,preview]).map(t=>t.mask),[10]);
  assert.deepEqual(wireTiles(existing).map(t=>t.mask),[0,0]);
  assert.equal(wireTiles([existing[0]],existing).length,1);
  assert.equal(wireTiles([preview],[wire(0,0,{breached:true}),preview])[0].mask,0);
});
test('both original wire sheets retain intact and fallen frames at floor pixel scale',()=>{
  const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
  for(const name of ['barb','fenc']){
    assert.equal(atlas.sprites[name].length,32);
    for(const id of atlas.sprites[name]){
      const frame=atlas.frames[id];assert.equal(frame.width,24);assert.equal(frame.height,24);
      assert.ok(frame.x>=0&&frame.y>=0&&frame.x+24<=atlas.size&&frame.y+24<=atlas.size);
    }
  }
});
test('the OpenRA chain-link sheet retains connected intact and damaged frames',()=>{
  const atlas=JSON.parse(readFileSync(new URL('../../public/assets/red-alert/atlas.json',import.meta.url),'utf8'));
  assert.equal(atlas.sprites.cycl.length,48);
  for(const id of atlas.sprites.cycl.slice(0,32)){
    const frame=atlas.frames[id];assert.equal(frame.width,24);assert.equal(frame.height,24);
    assert.ok(frame.x>=0&&frame.y>=0&&frame.x+24<=atlas.size&&frame.y+24<=atlas.size);
  }
  assert.match(atlas.source.palette,/wall sprites.*temperat\.pal/);
});

test('freeform fence panels preserve corners, gaps and damage boundaries',()=>{
  const section=(from:{x:number;y:number},to:{x:number;y:number},health=100)=>({kind:'fence',run:1,from,to,health,maxHealth:100});
  const panels=fencePanels([section({x:0,y:0},{x:4,y:0}),section({x:4,y:0},{x:4,y:4}),section({x:4,y:4},{x:4,y:8},20),section({x:9,y:8},{x:13,y:8})]);
  assert.deepEqual(panels.map(p=>[p.x,p.y,p.angle]),[[2,0,0],[4,2,Math.PI/2],[4,6,Math.PI/2],[11,8,0]]);
  assert.equal(panels[2].health,20);
});
test('fence coverage follows long diagonal paths in either drawing direction',()=>{
  const a={x:0,y:0},b={x:6,y:8};
  const forward=fencePanels([{kind:'fence',run:1,from:a,to:b,health:100,maxHealth:100}]);
  const reverse=fencePanels([{kind:'fence',run:1,from:b,to:a,health:100,maxHealth:100}]).reverse();
  assert.equal(forward.length,3);
  for(let i=0;i<3;i++){assert.ok(Math.hypot(forward[i].x-reverse[i].x,forward[i].y-reverse[i].y)<1e-10);assert.ok(forward[i].length<=4);}
});

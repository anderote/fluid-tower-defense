import test from 'node:test';
import assert from 'node:assert/strict';
import {drawEraInfantryFrame} from './infantry-art.ts';
import {INFANTRY_ATLAS_ROWS,INFANTRY_FRAME,INFANTRY_FRAMES,INFANTRY_KINDS,infantryAtlasOrigin} from './infantry-animation.ts';

test('expanded atlas tiles never overlap or exceed the default WebGPU texture size',()=>{
 const width=Math.ceil(INFANTRY_KINDS.length/INFANTRY_ATLAS_ROWS)*INFANTRY_FRAME*INFANTRY_FRAMES,height=INFANTRY_ATLAS_ROWS*8*INFANTRY_FRAME,slots=new Set<string>();
 assert.ok(width<=8192&&height<=8192);
 for(const kind of INFANTRY_KINDS)for(let facing=0;facing<8;facing++)for(let frame=0;frame<INFANTRY_FRAMES;frame++){
  const {x,y}=infantryAtlasOrigin(kind,facing,frame),key=`${x},${y}`;
  assert.ok(!slots.has(key));slots.add(key);assert.ok(x>=0&&y>=0&&x+INFANTRY_FRAME<=width&&y+INFANTRY_FRAME<=height);
 }
 assert.equal(slots.size,INFANTRY_KINDS.length*8*INFANTRY_FRAMES);
});

test('all new directional troop poses have visible pixels and stay inside their padded tile',()=>{
 let pixels=0;
 const context={fillStyle:'',clearRect(){pixels=0;},fillRect(x:number,y:number,w:number,h:number){
  assert.ok([x,y,w,h].every(Number.isFinite));assert.ok(x>0&&y>0&&x+w<INFANTRY_FRAME&&y+h<INFANTRY_FRAME,`clipped rectangle ${x},${y},${w},${h}`);pixels+=w*h;
 }} as unknown as CanvasRenderingContext2D;
 for(const kind of INFANTRY_KINDS.filter(kind=>!['rifle','rocket','flame','samurai','phalanx','dog','bazooka'].includes(kind)))
  for(let facing=0;facing<8;facing++)for(let frame=0;frame<INFANTRY_FRAMES;frame++){
   drawEraInfantryFrame(context,kind,facing,frame);assert.ok(pixels>20,`${kind} ${facing} ${frame}`);
  }
});

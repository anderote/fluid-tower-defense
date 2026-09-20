import test from 'node:test';
import assert from 'node:assert/strict';
import {infantryBuildingPixels,BUILDING_PIXEL,BUILDING_ANCHOR} from './infantry-building-art.ts';
import type {InfantryKind} from '../infantry/model.ts';
const kinds:InfantryKind[]=['rifle','rocket','flame','samurai'];
test('infantry facilities have unique, cached, finite pixel artwork and transparent surroundings',()=>{
  const signatures=new Set<string>();
  for(const kind of kinds){
    const pixels=infantryBuildingPixels(kind);assert.equal(pixels,infantryBuildingPixels(kind));
    assert.ok(pixels.length>100&&pixels.length<2000);
    for(const p of pixels){assert.ok(p.width>0&&p.height>0&&p.x>=0&&p.y>=0&&p.x+p.width<=64&&p.y+p.height<=80);assert.ok(p.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));}
    assert.ok(pixels.some(p=>p.color[3]<1),'grounded cast shadow');
    assert.ok(pixels.every(p=>p.x>0&&p.y>0),'no opaque background');
    signatures.add(JSON.stringify(pixels));
  }
  assert.equal(signatures.size,4);assert.equal(BUILDING_ANCHOR.x,32);
  assert.ok(64*BUILDING_PIXEL<6,'art remains compatible with the existing small footprint');
});

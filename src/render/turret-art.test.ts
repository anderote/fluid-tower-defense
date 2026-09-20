import assert from 'node:assert/strict';
import test from 'node:test';
import type {TowerKind} from '../contracts/index.ts';
import {TURRET_FOOTPRINT_PIXELS,TURRET_GRID,TURRET_PIXEL_SIZE,turretMuzzlePoint,turretPixelRects} from './turret-art.ts';

const kinds:TowerKind[]=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator'];

test('turret art is authored inside a detailed 128 x 128 logical footprint',()=>{
  assert.equal(TURRET_GRID*TURRET_PIXEL_SIZE,TURRET_FOOTPRINT_PIXELS);
  for(const kind of kinds){
    const pixels=turretPixelRects(kind);
    assert.ok(pixels.length>12,`${kind} should have a recognizable detailed sprite`);
    assert.ok(pixels.some(pixel=>pixel.width===1||pixel.height===1),`${kind} should use the finer 128 px detail grid`);
    for(const pixel of pixels){
      assert.ok(pixel.x>=0&&pixel.y>=0);
      assert.ok(pixel.x+pixel.width<=TURRET_GRID,`${kind} exceeds horizontal footprint`);
      assert.ok(pixel.y+pixel.height<=TURRET_GRID,`${kind} exceeds vertical footprint`);
    }
  }
});

test('muzzle points sit beyond the 128 x 128 turret body in the aim direction',()=>{
  for(const kind of kinds){
    const right=turretMuzzlePoint(kind,{x:10,y:20},0);
    assert.ok(right.x>11.5&&right.x<=12.2,`${kind} has an invalid muzzle distance`);
    assert.equal(right.y,20);
    const down=turretMuzzlePoint(kind,{x:10,y:20},Math.PI/2);
    assert.ok(Math.abs(down.x-10)<1e-9);
    assert.ok(down.y>21.5&&down.y<=22.2);
  }
});

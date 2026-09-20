import assert from 'node:assert/strict';
import test from 'node:test';
import type {TowerKind} from '../contracts/index.ts';
import {TURRET_FOOTPRINT_PIXELS,TURRET_GRID,TURRET_PIXEL_SIZE,turretEjection,turretHardpoints,turretMuzzlePoint,turretMuzzlePoints,turretPixelRects} from './turret-art.ts';

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

test('muzzle points rotate every authored barrel hardpoint with the turret',()=>{
  for(const kind of kinds){
    const authored=turretHardpoints(kind).muzzles;
    const right=turretMuzzlePoints(kind,{x:10,y:20},0);
    const down=turretMuzzlePoints(kind,{x:10,y:20},Math.PI/2);
    assert.equal(right.length,authored.length);
    assert.deepEqual(right,authored.map(point=>({x:10+point.x,y:20+point.y})));
    down.forEach((point,index)=>{
      assert.ok(Math.abs(point.x-(10-authored[index].y))<1e-9,`${kind} barrel ${index} has an invalid rotated x`);
      assert.ok(Math.abs(point.y-(20+authored[index].x))<1e-9,`${kind} barrel ${index} has an invalid rotated y`);
    });
    assert.deepEqual(turretMuzzlePoint(kind,{x:10,y:20},0),right[0]);
  }
});

test('rocket rounds use three aligned tubes and firearm cases eject from rotating receiver ports',()=>{
  assert.deepEqual(turretHardpoints('rocket').muzzles.map(point=>point.y),[-.52,0,.52]);
  assert.equal(turretEjection('mortar',{x:0,y:0},0),undefined);
  for(const kind of ['autocannon','railgun'] as const){
    const right=turretEjection(kind,{x:10,y:20},0)!;
    const down=turretEjection(kind,{x:10,y:20},Math.PI/2)!;
    assert.ok(right.direction.y<-.95,`${kind} should eject above a right-facing receiver`);
    assert.ok(down.direction.x>.95,`${kind} should eject right of a down-facing receiver`);
    assert.ok(Math.abs(right.direction.x-down.direction.y)<1e-9);
    assert.ok(Math.abs(right.direction.y+down.direction.x)<1e-9);
  }
});

import type {TowerKind, Vec2} from '../contracts/index.ts';

export const TURRET_FOOTPRINT_PIXELS=128;
export const TURRET_GRID=32;
export const TURRET_PIXEL_SIZE=4;

export type TurretInk='shadow'|'base'|'dark'|'body'|'light'|'accent'|'hot';
export interface TurretPixelRect {x:number;y:number;width:number;height:number;ink:TurretInk}

// The broad silhouettes start on a 16 x 16 drafting grid and are doubled onto
// the 32 x 32 canvas. One-cell details then use the extra 128 px resolution.
// Turrets face right; the renderer rotates the complete sprite toward its aim.
const COMMON_16:readonly TurretPixelRect[]=[
  {x:3,y:4,width:10,height:9,ink:'shadow'},
  {x:2,y:5,width:12,height:7,ink:'base'},
  {x:4,y:3,width:7,height:11,ink:'base'},
  {x:4,y:5,width:8,height:7,ink:'dark'},
];

const ART_16:Record<TowerKind,readonly TurretPixelRect[]>={
  repulsor:[...COMMON_16,
    {x:5,y:4,width:5,height:1,ink:'light'},{x:4,y:5,width:2,height:7,ink:'body'},
    {x:6,y:5,width:4,height:2,ink:'body'},{x:6,y:10,width:4,height:2,ink:'body'},
    {x:9,y:7,width:3,height:3,ink:'accent'},{x:12,y:6,width:2,height:1,ink:'hot'},
    {x:12,y:10,width:2,height:1,ink:'hot'},
  ],
  mortar:[...COMMON_16,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:4,height:2,ink:'light'},
    {x:7,y:6,width:4,height:5,ink:'dark'},{x:9,y:7,width:5,height:3,ink:'body'},
    {x:13,y:7,width:2,height:3,ink:'accent'},
  ],
  autocannon:[...COMMON_16,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:5,height:2,ink:'light'},
    {x:8,y:7,width:5,height:3,ink:'dark'},{x:11,y:6,width:4,height:1,ink:'body'},
    {x:11,y:10,width:4,height:1,ink:'body'},{x:14,y:6,width:2,height:1,ink:'accent'},
    {x:14,y:10,width:2,height:1,ink:'accent'},
  ],
  cryo:[...COMMON_16,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:6,width:3,height:5,ink:'light'},
    {x:8,y:7,width:4,height:3,ink:'dark'},{x:11,y:6,width:3,height:5,ink:'body'},
    {x:14,y:7,width:2,height:3,ink:'hot'},
  ],
  tesla:[...COMMON_16,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:5,height:2,ink:'light'},
    {x:7,y:6,width:2,height:5,ink:'accent'},{x:10,y:5,width:1,height:2,ink:'hot'},
    {x:11,y:7,width:2,height:3,ink:'accent'},{x:10,y:10,width:1,height:2,ink:'hot'},
    {x:13,y:6,width:2,height:1,ink:'hot'},{x:13,y:10,width:2,height:1,ink:'hot'},
  ],
  rocket:[...COMMON_16,
    {x:4,y:4,width:8,height:9,ink:'body'},{x:5,y:4,width:5,height:2,ink:'light'},
    {x:8,y:5,width:5,height:2,ink:'dark'},{x:8,y:8,width:6,height:2,ink:'dark'},
    {x:8,y:11,width:5,height:2,ink:'dark'},{x:12,y:5,width:3,height:2,ink:'accent'},
    {x:13,y:8,width:3,height:2,ink:'accent'},{x:12,y:11,width:3,height:2,ink:'accent'},
  ],
  railgun:[...COMMON_16,
    {x:3,y:6,width:8,height:5,ink:'body'},{x:4,y:6,width:6,height:1,ink:'light'},
    {x:8,y:7,width:7,height:1,ink:'accent'},{x:8,y:10,width:7,height:1,ink:'accent'},
    {x:10,y:8,width:6,height:2,ink:'dark'},{x:14,y:8,width:2,height:2,ink:'hot'},
  ],
  incinerator:[...COMMON_16,
    {x:3,y:5,width:7,height:7,ink:'body'},{x:4,y:6,width:3,height:5,ink:'light'},
    {x:8,y:7,width:4,height:3,ink:'dark'},{x:11,y:6,width:3,height:5,ink:'body'},
    {x:14,y:7,width:2,height:3,ink:'hot'},{x:5,y:12,width:3,height:2,ink:'accent'},
  ],
};

const DETAILS_32:Record<TowerKind,readonly TurretPixelRect[]>={
  repulsor:[
    {x:9,y:10,width:1,height:2,ink:'light'},{x:9,y:22,width:1,height:2,ink:'light'},
    {x:15,y:13,width:2,height:1,ink:'accent'},{x:15,y:20,width:2,height:1,ink:'accent'},
    {x:20,y:15,width:3,height:3,ink:'hot'},{x:25,y:13,width:1,height:2,ink:'hot'},{x:25,y:21,width:1,height:2,ink:'hot'},
  ],
  mortar:[
    {x:9,y:11,width:1,height:8,ink:'light'},{x:13,y:13,width:2,height:2,ink:'base'},
    {x:20,y:15,width:6,height:1,ink:'light'},{x:25,y:17,width:2,height:1,ink:'dark'},
    {x:28,y:15,width:1,height:4,ink:'hot'},
  ],
  autocannon:[
    {x:9,y:11,width:1,height:7,ink:'light'},{x:15,y:15,width:2,height:3,ink:'base'},
    {x:23,y:12,width:7,height:1,ink:'light'},{x:23,y:21,width:7,height:1,ink:'light'},
    {x:28,y:13,width:1,height:2,ink:'accent'},{x:28,y:19,width:1,height:2,ink:'accent'},
  ],
  cryo:[
    {x:9,y:13,width:1,height:7,ink:'light'},{x:12,y:13,width:1,height:7,ink:'accent'},
    {x:21,y:15,width:2,height:3,ink:'base'},{x:25,y:13,width:1,height:8,ink:'light'},
    {x:29,y:15,width:2,height:3,ink:'hot'},
  ],
  tesla:[
    {x:9,y:11,width:1,height:8,ink:'light'},{x:14,y:13,width:1,height:7,ink:'hot'},
    {x:18,y:11,width:2,height:2,ink:'accent'},{x:20,y:14,width:2,height:2,ink:'hot'},
    {x:22,y:17,width:2,height:2,ink:'accent'},{x:24,y:20,width:2,height:2,ink:'hot'},
    {x:28,y:13,width:1,height:2,ink:'hot'},{x:28,y:21,width:1,height:2,ink:'hot'},
  ],
  rocket:[
    {x:9,y:9,width:1,height:16,ink:'light'},{x:14,y:12,width:1,height:2,ink:'base'},
    {x:17,y:11,width:8,height:1,ink:'light'},{x:17,y:17,width:10,height:1,ink:'light'},
    {x:17,y:23,width:8,height:1,ink:'light'},{x:27,y:10,width:2,height:1,ink:'hot'},
    {x:29,y:16,width:2,height:1,ink:'hot'},{x:27,y:22,width:2,height:1,ink:'hot'},
  ],
  railgun:[
    {x:8,y:13,width:1,height:7,ink:'light'},{x:15,y:15,width:2,height:3,ink:'base'},
    {x:19,y:13,width:10,height:1,ink:'hot'},{x:19,y:20,width:10,height:1,ink:'hot'},
    {x:23,y:16,width:8,height:1,ink:'light'},{x:29,y:17,width:2,height:2,ink:'accent'},
  ],
  incinerator:[
    {x:8,y:13,width:1,height:7,ink:'light'},{x:12,y:13,width:1,height:7,ink:'hot'},
    {x:18,y:15,width:3,height:3,ink:'base'},{x:23,y:13,width:1,height:8,ink:'light'},
    {x:27,y:15,width:2,height:3,ink:'accent'},{x:30,y:16,width:2,height:1,ink:'hot'},
    {x:11,y:25,width:4,height:1,ink:'accent'},
  ],
};

const detailed=(kind:TowerKind):readonly TurretPixelRect[]=>[
  ...ART_16[kind].map(pixel=>({
    ...pixel,x:pixel.x*2,y:pixel.y*2,width:pixel.width*2,height:pixel.height*2,
  })),...DETAILS_32[kind],
];
const ART:Record<TowerKind,readonly TurretPixelRect[]>={
  repulsor:detailed('repulsor'),mortar:detailed('mortar'),autocannon:detailed('autocannon'),cryo:detailed('cryo'),
  tesla:detailed('tesla'),rocket:detailed('rocket'),railgun:detailed('railgun'),incinerator:detailed('incinerator'),
};

export interface TurretHardpoints {
  /** Barrel mouths in turret-local coordinates: +x is forward, +y is right. */
  muzzles:readonly Vec2[];
  /** Receiver port and initial throw direction for weapons with spent cases. */
  ejection?:{port:Vec2;direction:Vec2};
}

/**
 * Hardpoints match the default Soldat-inspired models in soldat-art.ts. Keeping
 * these in one table prevents projectiles, flashes, and cases from drifting away
 * from the rotating weapon art as each effect evolves.
 */
const HARDPOINTS:Record<TowerKind,TurretHardpoints>={
  repulsor:{muzzles:[{x:1.45,y:0}]},
  mortar:{muzzles:[{x:1.7,y:0}]},
  autocannon:{muzzles:[{x:2,y:0}],ejection:{port:{x:.08,y:-.2},direction:{x:-.22,y:-1}}},
  cryo:{muzzles:[{x:2,y:0}]},
  // The Tesla weapon is a vertical coil, so its arc starts at the pivot.
  tesla:{muzzles:[{x:0,y:0}]},
  rocket:{muzzles:[{x:1.95,y:-.52},{x:1.95,y:0},{x:1.95,y:.52}]},
  railgun:{muzzles:[{x:2.15,y:0}],ejection:{port:{x:-.48,y:-.28},direction:{x:-.16,y:-1}}},
  incinerator:{muzzles:[{x:2.15,y:0}]},
};

const rotateLocal=(origin:Vec2,angle:number,point:Vec2):Vec2=>{
  const forward={x:Math.cos(angle),y:Math.sin(angle)},side={x:-forward.y,y:forward.x};
  return {x:origin.x+forward.x*point.x+side.x*point.y,y:origin.y+forward.y*point.x+side.y*point.y};
};

export const turretPixelRects=(kind:TowerKind):readonly TurretPixelRect[]=>ART[kind];
export const turretHardpoints=(kind:TowerKind):TurretHardpoints=>HARDPOINTS[kind];
export const turretMuzzleDistance=(kind:TowerKind):number=>HARDPOINTS[kind].muzzles[0].x;
export const turretMuzzlePoints=(kind:TowerKind,origin:Vec2,angle:number):Vec2[]=>HARDPOINTS[kind].muzzles.map(point=>rotateLocal(origin,angle,point));
export const turretMuzzlePoint=(kind:TowerKind,origin:Vec2,angle:number,barrel=0):Vec2=>{
  const muzzles=HARDPOINTS[kind].muzzles;
  return rotateLocal(origin,angle,muzzles[Math.max(0,Math.min(muzzles.length-1,barrel))]);
};
export const turretEjection=(kind:TowerKind,origin:Vec2,angle:number):{point:Vec2;direction:Vec2}|undefined=>{
  const ejection=HARDPOINTS[kind].ejection;if(!ejection)return;
  const point=rotateLocal(origin,angle,ejection.port),tip=rotateLocal({x:0,y:0},angle,ejection.direction);
  const length=Math.max(.001,Math.hypot(tip.x,tip.y));
  return {point,direction:{x:tip.x/length,y:tip.y/length}};
};

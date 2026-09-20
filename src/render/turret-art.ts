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

const MUZZLE_DISTANCE:Record<TowerKind,number>={
  repulsor:1.55,mortar:1.7,autocannon:2,cryo:2,tesla:1.8,rocket:2,railgun:2.15,incinerator:2.15,
};

export const turretPixelRects=(kind:TowerKind):readonly TurretPixelRect[]=>ART[kind];
export const turretMuzzleDistance=(kind:TowerKind):number=>MUZZLE_DISTANCE[kind];
export const turretMuzzlePoint=(kind:TowerKind,origin:Vec2,angle:number):Vec2=>({
  x:origin.x+Math.cos(angle)*MUZZLE_DISTANCE[kind],
  y:origin.y+Math.sin(angle)*MUZZLE_DISTANCE[kind],
});

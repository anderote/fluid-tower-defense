import type {TowerKind, Vec2} from '../contracts/index.ts';

export const TURRET_FOOTPRINT_PIXELS=64;
export const TURRET_GRID=16;
export const TURRET_PIXEL_SIZE=4;

export type TurretInk='shadow'|'base'|'dark'|'body'|'light'|'accent'|'hot';
export interface TurretPixelRect {x:number;y:number;width:number;height:number;ink:TurretInk}

// Authored on a 16 x 16 grid where every cell is a 4 x 4 logical pixel block.
// Turrets face right; the renderer rotates the finished sprite toward its aim.
const COMMON:readonly TurretPixelRect[]=[
  {x:3,y:4,width:10,height:9,ink:'shadow'},
  {x:2,y:5,width:12,height:7,ink:'base'},
  {x:4,y:3,width:7,height:11,ink:'base'},
  {x:4,y:5,width:8,height:7,ink:'dark'},
];

const ART:Record<TowerKind,readonly TurretPixelRect[]>={
  repulsor:[...COMMON,
    {x:5,y:4,width:5,height:1,ink:'light'},{x:4,y:5,width:2,height:7,ink:'body'},
    {x:6,y:5,width:4,height:2,ink:'body'},{x:6,y:10,width:4,height:2,ink:'body'},
    {x:9,y:7,width:3,height:3,ink:'accent'},{x:12,y:6,width:2,height:1,ink:'hot'},
    {x:12,y:10,width:2,height:1,ink:'hot'},
  ],
  mortar:[...COMMON,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:4,height:2,ink:'light'},
    {x:7,y:6,width:4,height:5,ink:'dark'},{x:9,y:7,width:5,height:3,ink:'body'},
    {x:13,y:7,width:2,height:3,ink:'accent'},
  ],
  autocannon:[...COMMON,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:5,height:2,ink:'light'},
    {x:8,y:7,width:5,height:3,ink:'dark'},{x:11,y:6,width:4,height:1,ink:'body'},
    {x:11,y:10,width:4,height:1,ink:'body'},{x:14,y:6,width:2,height:1,ink:'accent'},
    {x:14,y:10,width:2,height:1,ink:'accent'},
  ],
  cryo:[...COMMON,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:6,width:3,height:5,ink:'light'},
    {x:8,y:7,width:4,height:3,ink:'dark'},{x:11,y:6,width:3,height:5,ink:'body'},
    {x:14,y:7,width:2,height:3,ink:'hot'},
  ],
  tesla:[...COMMON,
    {x:4,y:5,width:7,height:7,ink:'body'},{x:5,y:5,width:5,height:2,ink:'light'},
    {x:7,y:6,width:2,height:5,ink:'accent'},{x:10,y:5,width:1,height:2,ink:'hot'},
    {x:11,y:7,width:2,height:3,ink:'accent'},{x:10,y:10,width:1,height:2,ink:'hot'},
    {x:13,y:6,width:2,height:1,ink:'hot'},{x:13,y:10,width:2,height:1,ink:'hot'},
  ],
  rocket:[...COMMON,
    {x:4,y:4,width:8,height:9,ink:'body'},{x:5,y:4,width:5,height:2,ink:'light'},
    {x:8,y:5,width:5,height:2,ink:'dark'},{x:8,y:8,width:6,height:2,ink:'dark'},
    {x:8,y:11,width:5,height:2,ink:'dark'},{x:12,y:5,width:3,height:2,ink:'accent'},
    {x:13,y:8,width:3,height:2,ink:'accent'},{x:12,y:11,width:3,height:2,ink:'accent'},
  ],
  railgun:[...COMMON,
    {x:3,y:6,width:8,height:5,ink:'body'},{x:4,y:6,width:6,height:1,ink:'light'},
    {x:8,y:7,width:7,height:1,ink:'accent'},{x:8,y:10,width:7,height:1,ink:'accent'},
    {x:10,y:8,width:6,height:2,ink:'dark'},{x:14,y:8,width:2,height:2,ink:'hot'},
  ],
  incinerator:[...COMMON,
    {x:3,y:5,width:7,height:7,ink:'body'},{x:4,y:6,width:3,height:5,ink:'light'},
    {x:8,y:7,width:4,height:3,ink:'dark'},{x:11,y:6,width:3,height:5,ink:'body'},
    {x:14,y:7,width:2,height:3,ink:'hot'},{x:5,y:12,width:3,height:2,ink:'accent'},
  ],
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


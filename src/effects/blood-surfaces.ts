import type {Rect} from '../contracts/index.ts';
export const BLOOD_WALL_CAPACITY=1024,BLOOD_WALL_BYTES=16+BLOOD_WALL_CAPACITY*64;
export const BLOOD_WALL_WGSL=`
struct BloodWall {rect:vec4f,kills:array<atomic<u32>,4>,splashes:array<atomic<u32>,4>,flags:vec4u};
struct BloodWalls {header:vec4u,items:array<BloodWall,${BLOOD_WALL_CAPACITY}>};
`;
export const wallKey=(r:Rect)=>[r.x,r.y,r.width,r.height].join(':');
/** Stable slots retain stains when walls become rubble. Only geometry crosses CPU→GPU. */
export function createBloodWallTable(device:GPUDevice,buffer:GPUBuffer){
 const slots=new Map<string,number>();let signature='';
 return {slots,reset(){slots.clear();signature='';device.queue.writeBuffer(buffer,0,new Uint8Array(BLOOD_WALL_BYTES));},
 update(obstacles:readonly Rect[],built:readonly Rect[]){
  const own=new Set(built.map(wallKey)),key=JSON.stringify([obstacles.map(wallKey),[...own]]);if(key===signature)return;signature=key;
  const active=new Map(built.map(r=>[wallKey(r),r]));for(const r of obstacles)active.set(wallKey(r),r);
  for(const [key,r] of active)if(!slots.has(key)&&slots.size<BLOOD_WALL_CAPACITY){const slot=slots.size;slots.set(key,slot);device.queue.writeBuffer(buffer,16+slot*64,new Float32Array([r.x,r.y,r.width,r.height]));}
  for(const [key,slot] of slots)device.queue.writeBuffer(buffer,16+slot*64+48,new Uint32Array([active.has(key)?1:0,own.has(key)?1:0,0,0]));
  device.queue.writeBuffer(buffer,0,new Uint32Array([slots.size,0,0,0]));
 }};
}

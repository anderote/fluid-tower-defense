import type {Vec2} from '../contracts/index.ts';
export type Viewport={left:number;top:number;width:number;height:number};
export type Camera={x:number;y:number;zoom:number};
export type WorldSize={width:number;height:number};
const DEFAULT_WORLD={width:160,height:100};
function dimensions(viewport:Viewport,camera:Camera,world:WorldSize){
 const aspect=viewport.width/viewport.height,target=world.width/world.height;
 return {sx:Math.min(1,target/aspect),sy:Math.min(1,aspect/target),width:world.width/camera.zoom,height:world.height/camera.zoom};
}
/** Inverse of the GPU camera projection, including letterboxing and camera offset. */
export function screenToWorld(point:Vec2,viewport:Viewport,camera:Camera,world:WorldSize=DEFAULT_WORLD):Vec2 {
 const {sx,sy,width,height}=dimensions(viewport,camera,world);
 return {x:Math.max(0,Math.min(world.width,camera.x+(((point.x-viewport.left)/viewport.width*2-1)/sx+1)*width/2)),y:Math.max(0,Math.min(world.height,camera.y+(((point.y-viewport.top)/viewport.height*2-1)/sy+1)*height/2))};
}
/** Matches WGSL clip-space projection converted back to CSS client coordinates. */
export function worldToScreen(point:Vec2,viewport:Viewport,camera:Camera,world:WorldSize=DEFAULT_WORLD):Vec2 {
 const {sx,sy,width,height}=dimensions(viewport,camera,world);
 return {x:viewport.left+viewport.width*(((point.x-camera.x)/width*2-1)*sx+1)/2,y:viewport.top+viewport.height*(((point.y-camera.y)/height*2-1)*sy+1)/2};
}

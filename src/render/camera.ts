import type {Vec2} from '../contracts/index.ts';
export type Viewport={left:number;top:number;width:number;height:number};
export type Camera={x:number;y:number;zoom:number};
const WORLD_WIDTH=160,WORLD_HEIGHT=100;
function dimensions(viewport:Viewport,camera:Camera){
 const aspect=viewport.width/viewport.height,target=WORLD_WIDTH/WORLD_HEIGHT;
 return {sx:Math.min(1,target/aspect),sy:Math.min(1,aspect/target),width:WORLD_WIDTH/camera.zoom,height:WORLD_HEIGHT/camera.zoom};
}
/** Inverse of the GPU camera projection, including letterboxing and camera offset. */
export function screenToWorld(point:Vec2,viewport:Viewport,camera:Camera):Vec2 {
 const {sx,sy,width,height}=dimensions(viewport,camera);
 return {x:Math.max(0,Math.min(WORLD_WIDTH,camera.x+(((point.x-viewport.left)/viewport.width*2-1)/sx+1)*width/2)),y:Math.max(0,Math.min(WORLD_HEIGHT,camera.y+(((point.y-viewport.top)/viewport.height*2-1)/sy+1)*height/2))};
}
/** Matches WGSL clip-space projection converted back to CSS client coordinates. */
export function worldToScreen(point:Vec2,viewport:Viewport,camera:Camera):Vec2 {
 const {sx,sy,width,height}=dimensions(viewport,camera);
 return {x:viewport.left+viewport.width*(((point.x-camera.x)/width*2-1)*sx+1)/2,y:viewport.top+viewport.height*(((point.y-camera.y)/height*2-1)*sy+1)/2};
}

import {PARTICLE_WGSL} from '../contracts/index.ts';

// Private visual state; shared physics particles are read-only. Kept separate
// so checkpoints, collision radii, navigation and pressure retain their ABI.
export const SHAMBLER_STATE_BYTES=48;
export const SHAMBLER_STATE_WGSL=`
struct Animation { previous:vec4<f32>, pose:vec4<f32>, motion:vec4<f32> };
`;
export const SHAMBLER_ANIMATION_WGSL=`${PARTICLE_WGSL}${SHAMBLER_STATE_WGSL}
@group(0) @binding(0) var<storage,read> particles:array<Particle>;
@group(0) @binding(1) var<storage,read_write> animation:array<Animation>;
// time, dt, count, reset
@group(0) @binding(2) var<uniform> clock:vec4<f32>;
@compute @workgroup_size(128) fn update(@builtin(global_invocation_id) gid:vec3<u32>){
 let i=gid.x;if(i>=u32(clock.z)){return;}let p=particles[i];var a=animation[i];
 if(p.state.z>.5||p.state.w<.5){a.previous.w=0.;animation[i]=a;return;}
 let speed=length(p.pos.zw);let delta=p.pos.xy-a.previous.xy;
 let fresh=a.motion.w<.5||a.previous.w<.5||a.previous.z!=p.status.w||clock.w>.5||length(delta)>6.;
 if(fresh){
  a.previous=vec4(p.pos.xy,p.status.w,1.);
  a.pose=vec4(select(0.,atan2(p.pos.w,p.pos.z),speed>.15),fract(f32(i)*.618034+p.status.w*.37),0.,0.);
  a.motion=vec4(p.pos.zw,p.body.z,1.);animation[i]=a;return;
 }
 if(clock.y<=0.){return;}
 let moved=length(delta);let moving=moved/clock.y>.12;
 let impulse=length(p.pos.zw-a.motion.xy)>3.+clock.y*40.;
 let hurt=p.body.z<a.motion.z-.01;
 a.pose.z=max(0.,a.pose.z-clock.y);
 if(impulse||hurt){a.pose.z=.22;}
 let stagger=a.pose.z>0.||speed>5.5;
 if(!stagger&&moving&&speed>.12){
  let heading=atan2(p.pos.w,p.pos.z);let turn=atan2(sin(heading-a.pose.x),cos(heading-a.pose.x));
  a.pose.x+=clamp(turn,-clock.y*7.,clock.y*7.);
  a.pose.x=atan2(sin(a.pose.x),cos(a.pose.x));
  a.pose.y=fract(a.pose.y+min(moved,clock.y*3.8)/.95);
 }
 a.pose.w=select(select(0.,1.,moving),2.,stagger);
 a.previous=vec4(p.pos.xy,p.status.w,1.);a.motion=vec4(p.pos.zw,p.body.z,1.);animation[i]=a;
}
`;

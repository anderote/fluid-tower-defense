/** Shared by the firing shader and the GPU geometry regression check. */
export const SHOT_GEOMETRY_WGSL=`
fn autocannonTracer(q:vec2<f32>,muzzle:vec2<f32>,forward:vec2<f32>,range:f32,elapsed:f32)->vec2<f32>{
 let travel=clamp(elapsed/.058,0.,1.);
 let distance=max(0.,range)*travel;
 // A new tracer grows out of the muzzle. Its tail cannot precede launch.
 let tail=min(10.5,distance);
 let side=vec2(-forward.y,forward.x);
 return muzzle+forward*(distance-(q.x+1.)*.5*tail)+side*q.y*.13;
}
`;

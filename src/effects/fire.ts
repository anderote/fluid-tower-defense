/** Shared combat/render burn state: seconds left, damage/sec, spawn generation, ignition tick+1. */
export const FIRE_STATE_BYTES=16;
export const FIRE_STATE_WGSL=`
struct Heat { burn:vec4f };
fn fireActive(burn:vec4f,generation:f32)->bool{return burn.x>0.&&burn.y>0.&&burn.z==generation;}
`;
export const FIRE_BURN_SECONDS=1.5;

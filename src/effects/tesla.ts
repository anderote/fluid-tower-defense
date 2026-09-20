/** One primary hit and up to five jumps. GPU damage and drawing share these links. */
export const TESLA_LINKS=6;
export const TESLA_HEADER_BYTES=64*TESLA_LINKS*16;
export const TESLA_PARTICLE_BYTES=32;
export const TESLA_STATE_WGSL=`
struct TeslaVictim {shock:vec4f,corpse:vec4f}; // corpse = position, radius, death tick + 1
struct TeslaState {
 links:array<vec4f,${64*TESLA_LINKS}>, // position, particle slot (-1 boss / -2 unused), generation
 victims:array<TeslaVictim>, // shock = hit tick + 1, generation, lethal hit, power
};
fn teslaAge(shock:vec4f,generation:f32,time:f32)->f32 {
 return select(10000.,max(0.,time-(shock.x-1.)/60.),shock.x>0.&&shock.y==generation);
}
`;
// Reference: OpenRA mods/ra/sequences/infantry.yaml, die6 (80 ms per frame).
export const ELECTROCUTION_FRAMES=[0,1,2,3,0,1,2,3,0,1,2,3,4,5,6,7,8,9,10,11,12,13] as const;
export const ELECTROCUTION_FRAME_SECONDS=.08;
export const ELECTROCUTION_DURATION=ELECTROCUTION_FRAMES.length*ELECTROCUTION_FRAME_SECONDS;

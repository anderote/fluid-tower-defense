import {occupiedArea} from './model.ts';

/** Corpse terrain shares the physics grid, keeping lookup cost constant per body. */
export const MAX_CORPSE_FIELD_CELLS=65_536;
/** Five planes are reserved for the densest crowd solver before corpse mass. */
export const CORPSE_FIELD_WORD_OFFSET=MAX_CORPSE_FIELD_CELLS*5;
export const CORPSE_FIELD_SCALE=1024;
export const CORPSE_DECAY_SECONDS=45;
export const CORPSE_MIN_MASS=.01;
export const CORPSE_DRAG=.72;
export const CORPSE_SLOPE_FORCE=18;
export const CORPSE_BLAST_EROSION=2.4;

const KIND_MASS=[1,.62,4.5,1.15,3.25,1.8] as const;

export function corpseMass(radius:number,kind:number):number{
  const multiplier=KIND_MASS[Math.max(0,Math.min(KIND_MASS.length-1,Math.round(kind)))]??1;
  return occupiedArea(radius)*multiplier;
}

export function decayCorpseMass(mass:number,dt:number):number{
  const next=Math.max(0,mass)*(1-Math.max(0,dt)/CORPSE_DECAY_SECONDS);
  return next<CORPSE_MIN_MASS?0:next;
}

export function corpseSpeedMultiplier(height:number):number{
  return Math.max(.28,1/(1+Math.max(0,height)*CORPSE_DRAG));
}

export function erodeCorpseMass(mass:number,falloff:number):number{
  return Math.max(0,mass-Math.max(0,falloff)*CORPSE_BLAST_EROSION);
}

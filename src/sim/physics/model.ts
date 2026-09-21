/** Shared numerical choices for the CPU reference checks and WGSL solver. */
export const MAX_BODY_RADIUS = 0.6375;
// One cell spans the largest possible contact diameter, so the 3x3 neighbor
// search always sees bodies close enough to repel one another.
export const PHYSICS_CELL_SIZE = MAX_BODY_RADIUS * 2;
export const PHYSICS_KERNEL_RADIUS = 1;
export const PHYSICS_SUBSTEPS = 2;
export const MIN_BODY_RADIUS = 0.05;

// Crowd pressure (kPa), not explosive peak pressure. Saturation prevents runaway
// feedback when forward effort further compresses a blocked crowd.
export const SURGE_START = 12;
export const SURGE_FULL = 80;
export const SURGE_SPEED_GAIN = 0.65;
export const SURGE_RELEASE_GAIN = 0.75;
export const SURGE_COAST_DRAG = 0.9;
export function pressureSurge(pressure:number):number {
  const t=Math.max(0,Math.min(1,(pressure-SURGE_START)/(SURGE_FULL-SURGE_START)));
  return t*t*(3-2*t);
}

export function occupiedArea(radius: number): number {
  if (!Number.isFinite(radius)) radius = 0.25;
  const r = Math.min(MAX_BODY_RADIUS, Math.max(MIN_BODY_RADIUS, Math.abs(radius)));
  return Math.PI * r * r;
}

/** Compact-support 2D kernel. Its integral over a radius-one disk is one. */
export function packingKernel(distance: number, support = PHYSICS_KERNEL_RADIUS): number {
  if (!(support > 0) || distance >= support) return 0;
  const q = 1 - Math.max(0, distance) / support;
  return (6 / (Math.PI * support * support)) * q * q;
}

export function packingContribution(radius: number, distance: number): number {
  return occupiedArea(radius) * packingKernel(distance);
}

export function pressureForPacking(packing: number, stiffness: number): number {
  const p = Math.max(0, packing);
  return Math.min(200, Math.max(0, stiffness) * Math.max(p * p - 1, 0));
}

export function pressureDamageRate(
  pressure: number,
  damagePressure: number,
  crushPressure: number,
  crushDamage: number,
): number {
  const start = Math.max(0, damagePressure);
  const end = Math.max(start + 0.001, crushPressure);
  const ramp = Math.min(1, Math.max(0, (Math.max(0, pressure) - start) / (end - start)));
  const smoothRamp = ramp * ramp * (3 - 2 * ramp);
  return Math.max(0, crushDamage) * smoothRamp;
}

export function exposureIncrement(
  pressure: number,
  damagePressure: number,
  crushPressure: number,
  crushDamage: number,
  dt: number,
): number {
  return Math.max(0, dt) * pressureDamageRate(pressure, damagePressure, crushPressure, crushDamage);
}

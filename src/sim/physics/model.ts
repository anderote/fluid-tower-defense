/** Shared numerical choices for the CPU reference checks and WGSL solver. */
export const PHYSICS_CELL_SIZE = 1;
export const PHYSICS_KERNEL_RADIUS = 1;
export const PHYSICS_SUBSTEPS = 2;
export const MIN_BODY_RADIUS = 0.05;
export const MAX_BODY_RADIUS = 0.45;

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

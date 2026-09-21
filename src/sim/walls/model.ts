export const MAX_WALL_ENGINEERING = 20;
export const METAL_WALL_COST = 200;
export const CHAINLINK_FENCE_COST = 45;
/** Base structural damage budgets, calibrated as death-equivalent damage. */
export const BASE_WALL_DURABILITY = 1_800;
export const BASE_WALL_PRESSURE_RESISTANCE = 14;
export const BASE_FENCE_DURABILITY = 120;
export const BASE_BARBED_WIRE_DURABILITY = 350;
export const BASE_FENCE_PRESSURE_RESISTANCE = 8;
const WALL_FATIGUE_RATE = 0.012;
const FENCE_FATIGUE_RATE = 0.02;

/** Diminishing-return global wall technology: early ranks matter, late ranks refine. */
export function wallEngineeringMultiplier(level: number): number {
  const clamped = Math.max(0, Math.min(MAX_WALL_ENGINEERING, Math.floor(level)));
  return 1 + 0.58 * Math.log1p(clamped);
}

export function wallCapacity(level: number): number {
  return BASE_WALL_DURABILITY * wallEngineeringMultiplier(level);
}

/** Pressure below the operating threshold creates no structural fatigue. */
export function wallFatigueIncrement(pressure: number, contact: number, dt: number, level: number): number {
  const overload = Math.max(0, pressure - BASE_WALL_PRESSURE_RESISTANCE);
  const normalizedContact = Math.max(0, Math.min(1, contact));
  const engineering = wallEngineeringMultiplier(level);
  return Math.max(0, dt) * overload * overload * normalizedContact * WALL_FATIGUE_RATE / engineering;
}

export function wallHealthAfterPressure(health: number, pressure: number, contact: number, dt: number, level: number): number {
  return Math.max(0, health - wallFatigueIncrement(pressure, contact, dt, level));
}

export function fenceHealthAfterPressure(health: number, pressure: number, contact: number, dt: number): number {
  const overload = Math.max(0, pressure - BASE_FENCE_PRESSURE_RESISTANCE);
  const normalizedContact = Math.max(0, Math.min(1, contact));
  return Math.max(0, health - Math.max(0, dt) * overload * overload * normalizedContact * FENCE_FATIGUE_RATE);
}

/** Friendly explosions scuff lightweight barriers without replacing swarm wear. */
export function explosionBarrierDamage(maxHealth: number, distance: number, radius: number, fraction = .025): number {
  if(!Number.isFinite(maxHealth)||maxHealth<=0||!Number.isFinite(distance)||!Number.isFinite(radius)||radius<=0||distance>=radius)return 0;
  const falloff=1-Math.max(0,distance)/radius;
  return maxHealth*Math.max(0,Math.min(1,fraction))*falloff*falloff;
}

export function barrierHealthAfterExplosion(health: number, maxHealth: number, distance: number, radius: number): number {
  return Math.max(0,health-explosionBarrierDamage(maxHealth,distance,radius));
}

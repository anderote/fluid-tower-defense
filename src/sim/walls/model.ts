export const MAX_WALL_ENGINEERING = 20;
export const BASE_WALL_DURABILITY = 2_880;
export const BASE_WALL_PRESSURE_RESISTANCE = 90;
const WALL_FATIGUE_RATE = 0.006;

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

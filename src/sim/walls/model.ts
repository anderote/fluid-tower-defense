export const MAX_WALL_ENGINEERING = 20;

/** Diminishing-return global wall technology: early ranks matter, late ranks refine. */
export function wallEngineeringMultiplier(level: number): number {
  const clamped = Math.max(0, Math.min(MAX_WALL_ENGINEERING, Math.floor(level)));
  return 1 + 0.58 * Math.log1p(clamped);
}

export function wallCapacity(level: number): number {
  return 240 * wallEngineeringMultiplier(level);
}

/** Pressure below the operating threshold creates no structural fatigue. */
export function wallFatigueIncrement(pressure: number, contact: number, dt: number, level: number): number {
  const overload = Math.max(0, pressure - 34);
  const normalizedContact = Math.max(0, Math.min(1, contact));
  const engineering = wallEngineeringMultiplier(level);
  return Math.max(0, dt) * overload * overload * normalizedContact * 0.018 / engineering;
}

export function wallHealthAfterPressure(health: number, pressure: number, contact: number, dt: number, level: number): number {
  return Math.max(0, health - wallFatigueIncrement(pressure, contact, dt, level));
}

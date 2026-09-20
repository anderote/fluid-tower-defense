import type {TowerDef} from '../../contracts/index.ts';

/** The crowd equation of state is calibrated directly in kilopascals. */
export const SIM_PRESSURE_TO_KPA=1;

export function pressureKpa(simPressure:number):number {
  return Math.max(0,Number.isFinite(simPressure)?simPressure:0)*SIM_PRESSURE_TO_KPA;
}

export function formatPressure(kpa:number):string {
  const pressure=Math.max(0,Number.isFinite(kpa)?kpa:0);
  if(pressure>=1000){
    const mpa=pressure/1000,precision=mpa>=100?0:mpa>=10?1:2;
    return `${mpa.toFixed(precision)} MPa`;
  }
  return `${pressure<10?pressure.toFixed(1):Math.round(pressure)} kPa`;
}

/** Upgrades scale the authored peak using both energy and impulse, without changing damage balance. */
export function scaledPeakPressure(base:TowerDef,damage:number,force:number):number {
  const damageScale=Math.max(.05,damage/Math.max(.001,base.damage));
  const forceScale=base.force>0?Math.max(.05,force/base.force):damageScale;
  return base.peakPressureKpa*Math.sqrt(damageScale*forceScale);
}

export const MANUAL_BLAST_PEAK_KPA=1600;
export const MANUAL_PUSH_PEAK_KPA=280;


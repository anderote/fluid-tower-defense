import type {TowerDef} from '../../contracts/index.ts';

/** The crowd equation of state is calibrated directly in kilopascals. */
export const SIM_PRESSURE_TO_KPA=1;
export const BLAST_CORE_RADIUS_FRACTION=.2;
export const BLAST_TAPER_START_FRACTION=.8;

function smoothstep(edge0:number,edge1:number,value:number):number {
  const t=Math.max(0,Math.min(1,(value-edge0)/(edge1-edge0)));
  return t*t*(3-2*t);
}

/**
 * Effective peak pressure for a circular 2D blast. Pressure is finite inside the
 * explosive core, follows 1/r through the body of the wave, and fades smoothly
 * at the authored effect radius.
 */
export function blastPressureFalloff(distance:number,radius:number):number {
  const safeRadius=Math.max(.0001,Number.isFinite(radius)?radius:0);
  const safeDistance=Math.max(0,Number.isFinite(distance)?distance:0);
  if(safeDistance>=safeRadius)return 0;
  const coreRadius=safeRadius*BLAST_CORE_RADIUS_FRACTION;
  const inverseRadius=coreRadius/Math.max(coreRadius,safeDistance);
  const normalizedDistance=safeDistance/safeRadius;
  const edgeTaper=1-smoothstep(BLAST_TAPER_START_FRACTION,1,normalizedDistance);
  return inverseRadius*edgeTaper;
}

export function blastPressureKpa(peakPressureKpa:number,distance:number,radius:number):number {
  return Math.max(0,Number.isFinite(peakPressureKpa)?peakPressureKpa:0)*blastPressureFalloff(distance,radius);
}

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

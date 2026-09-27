/** New arrivals toughen smoothly across a wave; existing bodies retain their stats. */
export function waveEnemyStrength(progress:number):number{
  const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
  return 1+.8*t*t*(3-2*t);
}

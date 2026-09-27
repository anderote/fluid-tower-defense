/** Authored pressure arcs keyed to emitted quota, so blocked inlets cannot skip beats. */
type Beat = readonly [progress:number, pressure:number];
export const WAVE_PEAK_PRESSURE=2;
const ARCS:readonly (readonly Beat[])[]=[
  // Two assaults, a recovery, then a sustained final push.
  [[0,.55],[.12,1.1],[.25,1.3],[.36,.3],[.48,.4],[.62,1.35],[.7,.55],[.84,2],[.96,2],[1,.85]],
  // An early warning surge followed by a longer calm before the storm.
  [[0,.65],[.1,1.45],[.23,.35],[.38,.45],[.55,1.5],[.67,.4],[.82,2],[.96,2],[1,.85]],
  // Escalating attacks with two distinct recovery windows.
  [[0,.5],[.18,1.15],[.3,.3],[.43,1.55],[.56,.35],[.68,.5],[.86,2],[.96,2],[1,.85]],
];
export function wavePressure(wave:number,progress:number):number{
  const arc=ARCS[(Math.max(1,Math.floor(wave))-1)%ARCS.length];
  const position=Math.max(0,Math.min(1,progress));
  for(let i=1;i<arc.length;i++){
    const [end,to]=arc[i], [start,from]=arc[i-1];
    if(position<=end){const t=(position-start)/(end-start),smooth=t*t*(3-2*t);return from+(to-from)*smooth;}
  }
  return arc[arc.length-1][1];
}

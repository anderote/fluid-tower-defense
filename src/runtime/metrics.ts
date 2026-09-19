export function percentile(values: readonly number[], fraction:number):number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(fraction*sorted.length)-1))];
}
export class FrameMetrics {
  private samples:number[]=[];
  push(ms:number){if(ms>0&&Number.isFinite(ms)){this.samples.push(ms);if(this.samples.length>600)this.samples.shift();}}
  reset(){this.samples=[];}
  report(){const median=percentile(this.samples,.5);return{samples:this.samples.length,medianMs:median,p95Ms:percentile(this.samples,.95),fps:median?1000/median:0};}
}

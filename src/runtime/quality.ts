export type GraphicsQuality='auto'|'high'|'balanced'|'performance';
export function graphicsQuality(value:unknown):GraphicsQuality{return value==='high'||value==='balanced'||value==='performance'?value:'auto';}

/** Presentation-only feedback. Trials that don't improve frame time are reverted
 * so CPU/simulation bottlenecks don't permanently blur the battlefield. */
export class AdaptiveResolution {
  mode:GraphicsQuality='auto';
  scale=1;
  private average=0;
  private stable=0;
  private slow=0;
  private fast=0;
  private cooldown=0;
  private trial:{previous:number;baseline:number;elapsed:number}|undefined;
  setMode(value:GraphicsQuality){this.mode=value;this.scale=value==='balanced'?.75:value==='performance'?.5:1;this.average=0;this.stable=0;this.slow=0;this.fast=0;this.trial=undefined;this.cooldown=0;}
  observe(ms:number,visible=true){
    if(this.mode!=='auto'||!visible||!Number.isFinite(ms)||ms<=0||ms>1000)return this.scale;
    this.average=this.average?this.average+(ms-this.average)*(1-Math.exp(-ms/600)):ms;
    this.stable+=ms;this.cooldown=Math.max(0,this.cooldown-ms);
    if(this.trial){
      this.trial.elapsed+=ms;
      if(this.trial.elapsed>=2500){
        if(this.average>this.trial.baseline*.92){this.scale=this.trial.previous;this.cooldown=15000;}
        this.trial=undefined;this.stable=0;this.slow=0;this.fast=0;
      }
      return this.scale;
    }
    this.slow=this.average>22?this.slow+ms:0;
    this.fast=this.average<14?this.fast+ms:0;
    if(this.stable>=2000&&this.slow>=1500&&this.cooldown===0&&this.scale>.5){
      this.trial={previous:this.scale,baseline:this.average,elapsed:0};
      this.scale=Math.max(.5,Math.round((this.scale-.15)*100)/100);this.slow=0;
    }else if(this.fast>=8000&&this.scale<1&&this.cooldown===0){this.scale=Math.min(1,Math.round((this.scale+.15)*100)/100);this.stable=0;this.fast=0;this.cooldown=8000;}
    return this.scale;
  }
}

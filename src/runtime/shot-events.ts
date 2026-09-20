import {MAX_TOWERS, type Vec2} from '../contracts/index.ts';

const SHOT_STATE_FLOATS=12;

export interface ShotEvent {
  towerId:number;
  serial:number;
  target:Vec2;
  angle:number;
}

export function decodeShotStates(values:Float32Array,count:number):ShotEvent[]{
  const events:ShotEvent[]=[];
  for(let index=0;index<Math.min(MAX_TOWERS,count);index++){
    const offset=index*SHOT_STATE_FLOATS,towerId=Math.round(values[offset+8]??0),serial=Math.round(values[offset+9]??0);
    if(towerId<=0||serial<=0)continue;
    events.push({towerId,serial,target:{x:values[offset+2],y:values[offset+3]},angle:values[offset+7]});
  }
  return events;
}

/** Asynchronously observes the GPU-owned firing serial without stalling combat. */
export class ShotEventReader {
  private readonly buffer:GPUBuffer;
  private readonly onEvents:(events:readonly ShotEvent[])=>void;
  private readonly onError:(error:unknown)=>void;
  private readonly serials=new Map<number,number>();
  private busy=false;
  private version=0;

  constructor(device:GPUDevice,onEvents:(events:readonly ShotEvent[])=>void,onError:(error:unknown)=>void){
    this.onEvents=onEvents;this.onError=onError;
    this.buffer=device.createBuffer({label:'Asynchronous shot event staging',size:MAX_TOWERS*SHOT_STATE_FLOATS*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  }

  encode(encoder:GPUCommandEncoder,source:GPUBuffer,count:number):(()=>void)|undefined{
    if(this.busy||count<=0)return;
    this.busy=true;
    const version=this.version;
    encoder.copyBufferToBuffer(source,0,this.buffer,0,MAX_TOWERS*SHOT_STATE_FLOATS*4);
    return ()=>{void this.buffer.mapAsync(GPUMapMode.READ).then(()=>{
      const values=new Float32Array(this.buffer.getMappedRange()).slice();
      this.buffer.unmap();
      this.busy=false;
      if(version!==this.version)return;
      const fresh=decodeShotStates(values,count).filter(event=>{
        const prior=this.serials.get(event.towerId)??0;
        this.serials.set(event.towerId,event.serial);
        return event.serial!==prior;
      });
      if(fresh.length)this.onEvents(fresh);
    }).catch(error=>{this.busy=false;this.onError(error);});};
  }

  reset(){this.version++;this.serials.clear();}
  destroy(){this.buffer.destroy();}
}

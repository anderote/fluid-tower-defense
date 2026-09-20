import { COUNTER_WORDS, type Settlement } from '../contracts/index.ts';
/** One staging read at a time. Epoch captured at encoding prevents stale reset results. */
export class SettlementReader {
  private buffer: GPUBuffer;
  private busy = false;
  constructor(private device: GPUDevice, private onResult: (value: Settlement) => void, private onError:(error:unknown)=>void) {
    this.buffer = device.createBuffer({label:'Asynchronous settlement staging',size:COUNTER_WORDS*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  }
  get pending() {return this.busy;}
  encode(encoder:GPUCommandEncoder, source:GPUBuffer, epoch:number, tick:number): (()=>void)|undefined {
    if (this.busy) return;
    this.busy = true;
    encoder.copyBufferToBuffer(source,0,this.buffer,0,COUNTER_WORDS*4);
    return ()=> {void this.buffer.mapAsync(GPUMapMode.READ).then(()=>{
      const values = new Uint32Array(this.buffer.getMappedRange()).slice();
      this.buffer.unmap();
      this.busy=false;
      this.onResult({epoch,tick,kills:values[0],crushKills:values[1],leaks:values[2],earned:values[3],live:values[4],invalid:values[5],maxPacking:values[6]/1000,towerKills:Array.from(values.slice(16,80)),boss:{x:values[10]/100,y:values[11]/100,health:values[7]/100,maxHealth:values[8]/100,phase:values[9],active:values[12]===1}});
    }).catch(error=>{this.busy=false;this.onError(error);});};
  }
  destroy(){this.buffer.destroy();}
}

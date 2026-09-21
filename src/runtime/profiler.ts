import {percentile} from './metrics.ts';

export function summarize(samples:readonly number[]) {
  return {samples:samples.length,medianMs:percentile(samples,.5),p95Ms:percentile(samples,.95),maxMs:samples.length?Math.max(...samples):0};
}

/** CPU wall durations only; asynchronous GPU execution is measured separately. */
export class CPUProfiler {
  private samples=new Map<string,number[]>();
  record(label:string,ms:number){
    if(!Number.isFinite(ms)||ms<0)return;
    const values=this.samples.get(label)??[];values.push(ms);if(values.length>600)values.shift();this.samples.set(label,values);
  }
  report(){return Object.fromEntries([...this.samples].map(([label,values])=>[label,summarize(values)]));}
}

/** Opt-in pass attribution. No queue waits, at most three readbacks in flight.
 * Timing buffers are never reused while mapped. Native GPU objects stay native.
 * Pass timings do not include CPU work, presentation, or queue backlog. */
export class GPUProfiler {
  readonly supported:boolean;
  private slots:{query:GPUQuerySet;resolve:GPUBuffer;read:GPUBuffer;busy:boolean}[]=[];
  private samples=new Map<string,number[]>();
  readonly errors:string[]=[];
  skipped=0;
  private maxPasses:number;
  constructor(device:GPUDevice, maxPasses=128) {
    this.maxPasses=maxPasses;
    this.supported=device.features.has('timestamp-query');
    if(!this.supported)return;
    for(let i=0;i<3;i++)this.slots.push({
      query:device.createQuerySet({type:'timestamp',count:maxPasses*2}),
      resolve:device.createBuffer({size:maxPasses*16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),
      read:device.createBuffer({size:maxPasses*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),busy:false,
    });
  }
  wrap(encoder:GPUCommandEncoder) {
    const slot=this.slots.find(s=>!s.busy),labels:string[]=[];
    if(!slot){if(this.supported)this.skipped++;return {encoder,resolve:()=>{},read:async()=>{}};}
    slot.busy=true;
    const timed=(descriptor:GPUComputePassDescriptor|GPURenderPassDescriptor|undefined,kind:string)=>{
      if(labels.length>=this.maxPasses){this.skipped++;return descriptor;}
      const i=labels.length;labels.push(String(descriptor?.label||kind));
      return {...descriptor,timestampWrites:{querySet:slot.query,beginningOfPassWriteIndex:i*2,endOfPassWriteIndex:i*2+1}};
    };
    const proxy=new Proxy(encoder,{get:(target,key)=>{
      if(key==='beginComputePass')return (d?:GPUComputePassDescriptor)=>target.beginComputePass(timed(d,'Compute') as GPUComputePassDescriptor);
      if(key==='beginRenderPass')return (d:GPURenderPassDescriptor)=>target.beginRenderPass(timed(d,'Render') as GPURenderPassDescriptor);
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    return {encoder:proxy,resolve:()=>{
      if(labels.length){encoder.resolveQuerySet(slot.query,0,labels.length*2,slot.resolve,0);encoder.copyBufferToBuffer(slot.resolve,0,slot.read,0,labels.length*16);}
    },read:async()=>{
      try{
        if(!labels.length)return;
        await slot.read.mapAsync(GPUMapMode.READ,0,labels.length*16);
        const values=new BigUint64Array(slot.read.getMappedRange(0,labels.length*16));
        const totals=new Map<string,number>();
        labels.forEach((label,i)=>totals.set(label,(totals.get(label)??0)+Number(values[i*2+1]-values[i*2])/1e6));
        for(const [label,ms] of totals){const a=this.samples.get(label)??[];a.push(ms);if(a.length>600)a.shift();this.samples.set(label,a);}
        slot.read.unmap();
      }catch(e){this.errors.push(String(e));}finally{slot.busy=false;}
    }};
  }
  reset(){this.samples.clear();this.skipped=0;this.errors.length=0;}
  report(){return {supported:this.supported,skipped:this.skipped,errors:[...this.errors],passes:Object.fromEntries([...this.samples].map(([label,values])=>[label,summarize(values)]))};}
  destroy(){for(const s of this.slots){s.query.destroy();s.resolve.destroy();s.read.destroy();}this.slots=[];}
}

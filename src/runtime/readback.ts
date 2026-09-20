import { COUNTER_WORDS, HORDE_PRESSURE_COUNTER, MAX_TOWERS, TOWER_KILL_COUNTER_OFFSET, type Settlement } from '../contracts/index.ts';
/** One staging read at a time. Epoch captured at encoding prevents stale reset results. */
export class SettlementReader {
  private buffer: GPUBuffer;
  private obstacles: GPUBuffer;
  private obstacleCapacity=1;
  private busy = false;
  constructor(private device: GPUDevice, private onResult: (value: Settlement) => void, private onError:(error:unknown)=>void) {
    this.buffer = device.createBuffer({label:'Asynchronous settlement staging',size:COUNTER_WORDS*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    this.obstacles=device.createBuffer({label:'Asynchronous obstacle telemetry staging',size:3*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  }
  get pending() {return this.busy;}
  encode(encoder:GPUCommandEncoder, source:GPUBuffer, obstacleSource:GPUBuffer, obstacleCapacity:number, epoch:number, tick:number): (()=>void)|undefined {
    if (this.busy) return;
    if(obstacleCapacity>this.obstacleCapacity){this.obstacles.destroy();this.obstacleCapacity=obstacleCapacity;this.obstacles=this.device.createBuffer({label:'Asynchronous obstacle telemetry staging',size:obstacleCapacity*3*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});}
    this.busy = true;
    encoder.copyBufferToBuffer(source,0,this.buffer,0,COUNTER_WORDS*4);
    encoder.copyBufferToBuffer(obstacleSource,0,this.obstacles,0,obstacleCapacity*3*4);
    return ()=> {void Promise.all([this.buffer.mapAsync(GPUMapMode.READ),this.obstacles.mapAsync(GPUMapMode.READ)]).then(()=>{
      const values = new Uint32Array(this.buffer.getMappedRange()).slice();
      const obstacleValues=new Uint32Array(this.obstacles.getMappedRange()).slice();
      this.buffer.unmap();
      this.obstacles.unmap();
      this.busy=false;
      this.onResult({epoch,tick,kills:values[0],crushKills:values[1],leaks:values[2],earned:values[3],live:values[4],invalid:values[5],maxPacking:values[6]/1000,maxPressure:values[14]/100,inletBlocked:values[HORDE_PRESSURE_COUNTER]!==0,towerKills:Array.from(values.slice(TOWER_KILL_COUNTER_OFFSET,TOWER_KILL_COUNTER_OFFSET+MAX_TOWERS)),obstacleContacts:Array.from(obstacleValues.slice(0,obstacleCapacity)),obstaclePacking:Array.from(obstacleValues.slice(obstacleCapacity,obstacleCapacity*2),value=>value/1000),obstaclePressure:Array.from(obstacleValues.slice(obstacleCapacity*2,obstacleCapacity*3),value=>value/100),boss:{x:values[10]/100,y:values[11]/100,health:values[7]/100,maxHealth:values[8]/100,phase:values[9],active:values[12]===1}});
    }).catch(error=>{this.busy=false;this.onError(error);});};
  }
  destroy(){this.buffer.destroy();this.obstacles.destroy();}
}

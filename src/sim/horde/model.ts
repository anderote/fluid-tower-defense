import {ENEMIES} from '../../content/index.ts';
import {HORDE_APPROACH, P, PARTICLE_FLOATS, type SpawnBatch, type WorldMap} from '../../contracts/index.ts';

/** A moving cross-section of a much larger horde, generated in O(new arrivals). */
export class HordeFront {
  private elapsed=0;
  private nextRow=0;
  private row=0;
  reset(){this.elapsed=0;this.nextRow=0;this.row=0;}
  advance(dt:number,map:WorldMap,wave:number,difficulty:number,kinds:readonly SpawnBatch[]):{x:number;y:number}[]{
    this.elapsed+=dt;
    if(!kinds.length)return [];
    const radius=Math.max(...kinds.map(batch=>ENEMIES[batch.kind].radius));
    const speed=Math.min(...kinds.map(batch=>ENEMIES[batch.kind].speed));
    const spacing=radius*2+.16, interval=spacing/speed;
    const height=Math.min(map.height,Math.max(spacing,map.spawn.height)), bottom=Math.max(0,Math.min(map.height-height,map.spawn.y));
    const rows=Math.floor(height/spacing), positions:{x:number;y:number}[]=[];
    const density=Math.min(.94,.38+Math.log2(Math.max(1,wave))*.09+Math.log2(Math.max(1,difficulty))*.1);
    while(this.nextRow<=this.elapsed){
      for(let lane=0;lane<rows;lane++){
        const patch=.17*Math.sin(this.nextRow*.63+lane*.29)+.12*Math.sin(this.nextRow*.27-lane*.51);
        const hash=(Math.imul(this.row+1,73856093)^Math.imul(lane+1,19349663))>>>0;
        const noise=((Math.imul(hash^(hash>>>16),1597334677)>>>0)%10000)/10000;
        if(noise>density+patch)continue;
        positions.push({x:-HORDE_APPROACH+2+((lane*.61803398875)%1)*spacing*.8+(this.elapsed-this.nextRow)*speed,y:bottom+(lane+.5)*spacing+(.5-noise)*.06});
      }
      this.row++;this.nextRow+=interval;
    }
    return positions;
  }
}

export function encodeHorde(batches:readonly SpawnBatch[],positions:readonly {x:number;y:number}[]):Float32Array{
  const count=batches.reduce((sum,batch)=>sum+batch.count,0);
  if(count>positions.length)throw new RangeError('Horde arrivals exceed available frontage.');
  const output=new Float32Array(count*PARTICLE_FLOATS);
  // Interleave species across the front instead of sorting them into horizontal bands.
  const remaining=batches.map(batch=>batch.count), assigned=batches.map(()=>0);
  for(let index=0;index<count;index++){
    let selected=-1,score=-Infinity;
    for(let i=0;i<batches.length;i++)if(remaining[i]>0){const deficit=(index+1)*batches[i].count/count-assigned[i];if(deficit>score){selected=i;score=deficit;}}
    const batch=batches[selected],enemy=ENEMIES[batch.kind],offset=index*PARTICLE_FLOATS;
    remaining[selected]--;assigned[selected]++;
    output[offset+P.x]=positions[index].x;output[offset+P.y]=positions[index].y;
    output[offset+P.vx]=enemy.speed;output[offset+P.radius]=enemy.radius;output[offset+P.mass]=enemy.mass;
    output[offset+P.hp]=output[offset+P.maxHp]=enemy.health*(batch.healthScale??1);
    output[offset+P.kind]=enemy.index;output[offset+P.alive]=1;
  }
  return output;
}

/** Delayed telemetry must never authorize overwriting a still-live GPU slot. */
export class HordeCapacity {
  private live=0;
  private pending:{tick:number;count:number}[]=[];
  reset(){this.live=0;this.pending=[];}
  available(capacity:number){return Math.max(0,capacity-this.live-this.pending.reduce((sum,item)=>sum+item.count,0));}
  add(tick:number,count:number){if(count)this.pending.push({tick,count});}
  settle(tick:number,live:number){this.live=live;this.pending=this.pending.filter(item=>item.tick>tick);}
}

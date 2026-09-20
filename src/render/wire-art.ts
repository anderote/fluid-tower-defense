import type {Rect} from '../contracts/index.ts';

export type WireArtStyle='barb'|'fenc';
export type WireState=Rect&{health:number;maxHealth:number;breached:boolean};
export type WireDamage='intact'|'worn'|'frayed'|'breached';
export function wireDamage(wire:Pick<WireState,'health'|'maxHealth'|'breached'>):WireDamage{
  if(wire.breached)return 'breached';
  const ratio=wire.maxHealth>0?wire.health/wire.maxHealth:0;
  return ratio>.7?'intact':ratio>.35?'worn':'frayed';
}

/** Original 24px fence frames use N=1, E=2, S=4, W=8 connectivity.
 * Breached cells keep debris, but no longer connect living fence segments.
 * This is visual topology only: never change the collision rectangles.
 */
export function wireTiles(wires:readonly WireState[],connections:readonly WireState[]=wires){
  const contains=(x:number,y:number,includeBreached:boolean)=>connections.some(w=>(includeBreached||!w.breached)&&x>=w.x&&x<w.x+w.width&&y>=w.y&&y<w.y+w.height);
  const result:(Rect&{mask:number;debrisMask:number;damage:WireDamage})[]=[];
  for(const wire of wires)for(let y=wire.y;y<wire.y+wire.height;y+=4)for(let x=wire.x;x<wire.x+wire.width;x+=4){
    const width=Math.min(4,wire.x+wire.width-x),height=Math.min(4,wire.y+wire.height-y);
    const mask=(debris:boolean)=>
      (contains(x+width/2,y-.001,debris)?1:0)|
      (contains(x+width+.001,y+height/2,debris)?2:0)|
      (contains(x+width/2,y+height+.001,debris)?4:0)|
      (contains(x-.001,y+height/2,debris)?8:0);
    result.push({x,y,width,height,mask:mask(false),debrisMask:mask(true),damage:wireDamage(wire)});
  }
  return result;
}

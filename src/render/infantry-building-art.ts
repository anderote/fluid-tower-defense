import type {InfantryKind} from '../infantry/model.ts';

// Original, north-lit pixel artwork. The foundation remains the gameplay 4 × 4
// footprint; roofs project upward, never changing collision or recruitment.
export const BUILDING_PIXEL=.085, BUILDING_ANCHOR={x:32,y:55};
export type BuildingPixel={x:number;y:number;width:number;height:number;color:[number,number,number,number]};
const palette={
 outline:'#20251f',shadow:'#10171088',concrete:'#626451',edge:'#95917a',
 wall:'#555b43',wallDark:'#383e30',light:'#90916a',olive:'#737b50',
 roof:'#626e45',roofDark:'#424e32',seam:'#323b29',steel:'#70786c',
 steelLight:'#a3ac97',steelDark:'#434b44',red:'#873e2b',redLight:'#b26542',
 redDark:'#532f25',black:'#202822',glass:'#91a899',lamp:'#d9c688',
 brass:'#ab9455',wood:'#5c4932',woodLight:'#8a7250',
} as const;
type Ink=keyof typeof palette;
const cache=new Map<InfantryKind,readonly BuildingPixel[]>();
export function infantryBuildingPixels(kind:InfantryKind):readonly BuildingPixel[]{
  const cached=cache.get(kind);if(cached)return cached;
  const width=64,height=80,grid:(Ink|undefined)[]=Array(width*height);
  const dot=(x:number,y:number,c:Ink)=>{if(x>=0&&y>=0&&x<width&&y<height)grid[y*width+x]=c;};
  const box=(x:number,y:number,w:number,h:number,c:Ink)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c);};
  const polygon=(points:number[][],c:Ink)=>{for(let y=0;y<height;y++)for(let x=0;x<width;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y+.5)!==(b[1]>y+.5)&&x+.5<(b[0]-a[0])*(y+.5-a[1])/(b[1]-a[1])+a[0])inside=!inside;}if(inside)dot(x,y,c);}};
  const ellipse=(x:number,y:number,rx:number,ry:number,c:Ink)=>{for(let j=Math.floor(y-ry);j<=y+ry;j++)for(let i=Math.floor(x-rx);i<=x+rx;i++)if(((i-x)/rx)**2+((j-y)/ry)**2<=1)dot(i,j,c);};
  const window=(x:number,y:number,w=6)=>{box(x,y,w,5,'outline');box(x+1,y+1,w-2,2,'glass');box(x,y+5,w,1,'light');};
  const door=(x:number,y:number,w=10,h=14)=>{box(x-1,y-1,w+2,h+2,'outline');box(x,y,w,h,'steelDark');for(let j=2;j<h;j+=3)box(x,y+j,w,1,'steel');box(x+w-2,y+h-5,1,2,'brass');box(x-2,y+h,w+4,2,'edge');};
  const crate=(x:number,y:number)=>{box(x+1,y+2,8,7,'outline');box(x,y,7,7,'wood');box(x,y,7,1,'woodLight');box(x+1,y+1,1,5,'woodLight');box(x+5,y+1,1,5,'woodLight');box(x+2,y+3,3,1,'woodLight');};
  const vent=(x:number,y:number)=>{box(x,y,9,7,'steelDark');box(x,y,9,1,'steelLight');for(let i=2;i<7;i+=2)box(x+1,y+i,6,1,'black');};
  // Cast southeast, with a broken bevel around the concrete footing.
  polygon([[10,35],[49,35],[62,55],[56,74],[15,73],[6,60]],'shadow');
  box(7,48,48,23,'outline');box(8,48,46,21,'concrete');
  box(8,48,46,1,'edge');box(8,49,1,19,'edge');
  for(let x=13;x<54;x+=10)box(x,65,1,4,'wallDark');
  if(kind==='rifle'){
    // Long corrugated Quonset hut, raised ridge and a staffed guard annex.
    box(10,31,34,32,'outline');box(12,33,30,28,'wall');
    polygon([[10,33],[16,19],[35,19],[45,33],[45,49],[10,49]],'roofDark');
    polygon([[10,33],[16,19],[25,17],[25,45],[10,49]],'roof');
    polygon([[25,17],[35,19],[45,33],[45,49],[25,45]],'olive');
    box(24,17,2,28,'light');
    for(let y=22;y<45;y+=4){box(14,y,10,1,'seam');box(27,y,12,1,'roofDark');box(15,y+1,8,1,'olive');}
    box(10,48,35,2,'black');box(11,47,34,1,'light');
    door(23,48,10,13);window(13,52,6);window(36,52,6);
    box(43,42,9,20,'wallDark');box(42,38,12,6,'outline');box(43,38,10,4,'roof');
    window(45,46,6);box(48,18,1,20,'steelLight');box(49,18,8,5,'red');box(49,18,6,1,'redLight');
    crate(11,61);crate(42,63);box(23,64,13,2,'light');
  }else if(kind==='rocket'){
    // Reinforced academy with two upright training missiles and radar mast.
    box(10,35,40,29,'outline');box(11,36,30,27,'wall');box(41,36,8,27,'wallDark');
    polygon([[9,35],[17,23],[43,23],[51,35],[51,40],[9,40]],'steelDark');
    polygon([[10,34],[17,23],[42,23],[48,34]],'steel');
    box(10,34,40,2,'steelLight');box(12,39,36,2,'redDark');
    for(const x of [17,29]){
      box(x-3,26,9,10,'black');box(x-2,14,7,18,'steelDark');box(x-1,13,4,18,'steelLight');
      polygon([[x-2,14],[x+1,6],[x+5,14]],'red');box(x,10,1,4,'redLight');
      polygon([[x-2,25],[x-5,32],[x-2,31]],'steel');polygon([[x+5,25],[x+8,32],[x+5,31]],'steelDark');
      box(x-1,23,6,2,'redDark');
    }
    box(45,15,2,19,'steelLight');polygon([[37,12],[48,6],[54,10],[43,17]],'steelDark');
    polygon([[38,11],[48,7],[52,9],[43,14]],'steelLight');box(43,11,1,5,'black');
    door(22,46,14,17);window(12,45,6);vent(40,44);
    for(let x=21;x<38;x+=4)box(x,64,2,2,'brass');
    crate(10,61);box(42,56,5,7,'redDark');box(43,57,3,1,'redLight');
  }else if(kind==='flame'){
    // Fireproof brick workshop, twin banded fuel tanks and soot-dark chimney.
    box(9,32,29,32,'outline');box(10,34,27,28,'redDark');
    for(let y=37;y<60;y+=4)for(let x=11+(y%8?0:3);x<35;x+=7)box(x,y,5,1,'red');
    polygon([[8,32],[14,21],[34,21],[39,32],[39,38],[8,38]],'steelDark');
    polygon([[9,31],[14,21],[33,21],[37,31]],'steel');box(9,31,29,2,'steelLight');
    box(13,12,6,17,'outline');box(14,13,4,16,'steelDark');box(12,11,8,3,'black');box(13,11,6,1,'steel');
    vent(25,25);door(18,47,12,15);
    for(const x of [41,51]){
      box(x-4,37,8,22,'outline');box(x-3,36,6,23,'redDark');box(x-3,37,3,21,'red');
      ellipse(x,36,4,3,'steel');ellipse(x-1,35,2,1,'steelLight');
      for(const y of [42,54]){box(x-4,y,8,2,'steelDark');box(x-3,y,4,1,'steelLight');}
      box(x-1,31,2,3,'brass');box(x-3,59,6,2,'steelDark');
    }
    box(35,59,18,3,'steelDark');box(36,59,16,1,'steel');box(35,53,2,7,'steel');
    box(11,41,5,5,'brass');polygon([[12,45],[13,41],[15,45]],'black');
    for(let x=16;x<34;x+=4)box(x,64,2,2,'brass');crate(9,62);
  }else if(kind==='phalanx'){
    // Field armory: low olive roof, bronze shields and an outdoor spear rack.
    box(10,34,41,30,'outline');box(11,35,39,28,'wall');
    polygon([[8,35],[17,22],[44,22],[54,35]],'roofDark');
    polygon([[9,34],[17,22],[42,22],[49,34]],'roof');box(9,34,43,2,'light');
    door(26,47,12,16);window(14,41,7);
    for(const x of [17,43]){ellipse(x,54,5,6,'outline');ellipse(x,53,4,5,'brass');ellipse(x,53,2,3,'olive');box(x,52,1,2,'lamp');}
    for(const x of [44,48,52]){box(x,16,1,27,'woodLight');polygon([[x-2,18],[x,11],[x+2,18]],'steelLight');}
    box(42,30,13,2,'wood');box(42,41,13,2,'wood');crate(10,63);
  }else if(kind==='dog'){
    // Emergency fallback only; the game normally draws original kenn.shp.
    box(17,42,31,23,'wood');box(18,42,29,2,'woodLight');
    polygon([[12,44],[32,27],[53,44]],'roof');
    polygon([[32,27],[53,44],[48,46],[32,34]],'roofDark');
    box(25,49,14,16,'black');box(25,48,14,2,'outline');
    box(18,62,7,2,'woodLight');box(41,62,6,2,'woodLight');
  }else{
    // A fortified field dojo: concrete bunker, dark tiled hip roof, red beams.
    box(12,36,38,28,'outline');box(13,37,36,25,'wall');box(43,38,6,25,'wallDark');
    for(const x of [14,28,45]){box(x,42,3,21,'redDark');box(x,42,1,20,'redLight');}
    window(18,48,8);window(34,48,8);door(28,48,5,14);
    polygon([[5,42],[12,34],[22,19],[41,19],[51,35],[59,42],[58,46],[5,46]],'outline');
    polygon([[7,41],[15,33],[23,20],[31,19],[30,39]],'steel');
    polygon([[31,19],[41,20],[49,33],[57,41],[30,39]],'steelDark');
    for(let y=25;y<=38;y+=4){const inset=Math.max(0,36-y);box(11+inset,y,43-inset*2,1,'black');box(12+inset,y+1,16-inset,1,'steelLight');}
    polygon([[5,41],[30,38],[59,41],[58,44],[30,41],[6,44]],'redDark');
    box(24,18,17,2,'steelLight');box(22,17,3,2,'steel');box(40,17,3,2,'steel');
    box(10,44,3,18,'redDark');box(49,44,3,18,'redDark');
    for(const x of [11,50]){box(x-2,50,5,6,'outline');box(x-1,51,3,4,'lamp');box(x,56,1,3,'brass');}
    box(21,63,22,2,'edge');box(19,66,26,2,'concrete');
    box(29,42,6,4,'black');box(30,43,4,1,'brass');
    crate(45,62);
  }
  // Sparse, deterministic patina; avoid shimmering random texture each frame.
  const colors=new Map<string,[number,number,number,number]>();
  const rgba=(ink:Ink,x:number,y:number)=>{
    const hex=palette[ink],noise=((x*17+y*31+(x*y)%13)%23===0)?-9:0,key=ink+noise;
    let c=colors.get(key);if(!c){c=[...([1,3,5].map(i=>Math.max(0,parseInt(hex.slice(i,i+2),16)+noise)/255)),hex.length===9?parseInt(hex.slice(7),16)/255:1] as [number,number,number,number];colors.set(key,c);}return c;
  };
  const result:BuildingPixel[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;){
    const ink=grid[y*width+x];if(!ink){x++;continue;}const color=rgba(ink,x,y),start=x++;
    while(x<width&&grid[y*width+x]===ink&&rgba(ink,x,y)===color)x++;
    result.push({x:start,y,width:x-start,height:1,color});
  }
  cache.set(kind,result);return result;
}

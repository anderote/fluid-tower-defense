import type {Biome,MapScenery,Rect,WorldMap} from '../contracts/index.ts';
import templates from '../../scripts/red-alert-terrain.json' with {type:'json'};
const layouts:Record<string,{columns:number;rows:number;solid:number[]}>=templates;

function author(biome:Biome,title:string,briefing:string){
  const scenery:MapScenery={biome,title,briefing,solids:[],mounts:[],tiles:[],props:[],regions:[]};
  const map:WorldMap={id:`pressure-front-${biome}-1`,width:160,height:100,obstacles:[],spawn:{x:0,y:20,width:8,height:60},goal:{x:154,y:50},goalRadius:4,scenery};
  const solid=(rect:Rect)=>{map.obstacles.push(rect);scenery.solids.push(rect);};
  const stamp=(name:string,x:number,y:number,blocking=false)=>{
    const layout=layouts[name];scenery.tiles.push({sprite:`${biome}:${name}`,x,y,columns:layout.columns,rows:layout.rows});
    if(blocking)for(const index of layout.solid)solid({x:x+(index%layout.columns)*4,y:y+Math.floor(index/layout.columns)*4,width:4,height:4});
  };
  // Terrain templates are not all homogeneous rectangles. Selecting their
  // authored frames lets roads retain their vertical, horizontal, and join
  // pieces rather than stretching a transition tile into a broken strip.
  const tile=(name:string,firstFrame:number,x:number,y:number)=>scenery.tiles.push({sprite:`${biome}:${name}`,x,y,columns:1,rows:1,firstFrame});
  const prop=(sprite:string,x:number,y:number,width=4,height=4)=>{
    // x/y anchor the bottom center of the original sprite; trunks and building
    // foundations—not transparent sprite margins—define their solid footprints.
    scenery.props.push({sprite:`${biome}:${sprite}`,x,y});solid({x:x-width/2,y:y-height,width,height});
  };
  const wall=(x:number,y:number,width:number,height:number)=>{const rect={x,y,width,height};map.obstacles.push(rect);scenery.mounts.push(rect);};
  const road=(x:number,y:number,length:number)=>{for(let xx=x;xx<x+length;xx+=4)tile('d10',4+(Math.floor((xx-x)/4)%4),xx,y);};
  const verticalRoad=(x:number,y:number,length:number)=>{for(let yy=y;yy<y+length;yy+=4)tile('d03',1,x,yy);};
  const roadJoin=(x:number,y:number)=>{
    // D05 is the original broad T-junction transition. The adjoining straight
    // cells continue through it instead of terminating against a square stamp.
    stamp('d05',x-4,y-8);
  };
  const grove=(x:number,y:number,columns:number,rows:number,seed:number)=>{
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const hash=(Math.imul(seed+col*13+row*37,2654435761)>>>0);if(hash%7===0)continue;
      prop(['t01','t03','t10','t16','t17'][hash%5],x+col*5+(hash%3),y+row*5+((hash>>>4)%3),2,2);
    }
  };
  const ridge=(x:number,y:number,height:number)=>{for(let yy=y;yy<y+height-8;yy+=8){stamp('s11',x,yy,true);stamp('s21',x+8,yy,true);}stamp('s09',x,y+height-8,true);};
  return {map,scenery,solid,stamp,prop,wall,road,verticalRoad,roadJoin,grove,ridge};
}

function forest(){
  const a=author('forest','Pine Valley','Hold the village approach. Use the ridge mouth for a first defense, then cover both sides of the central rocks from the village clearing.');
  // A broad, boss-safe first gate; a separate central spine creates two lanes.
  a.ridge(48,0,40);a.ridge(48,64,36);a.ridge(88,28,48);
  // Tracks pass the village. Use the original straight, vertical, and T-junction
  // frames so every road section joins cleanly rather than repeating a cap.
  a.road(0,48,80);a.road(112,48,48);
  a.verticalRoad(76,20,56);a.verticalRoad(108,20,56);
  a.roadJoin(76,48);a.roadJoin(108,48);
  for(const [x,y] of [[16,32],[28,68],[64,12],[68,80],[104,16],[128,76],[136,8]])a.stamp('p07',x,y);
  for(const [sprite,x,y] of [['v01',116,34],['v03',132,34],['v02',116,74],['v07',132,70],['v09',142,30]] as const)a.prop(sprite,x,y,sprite==='v09'?3:6,sprite==='v07'?3:5);
  for(const [x,y] of [[16,12],[28,16],[36,8],[68,12],[76,20],[108,10],[124,12],[144,12],[16,88],[28,96],[38,84],[66,88],[78,96],[106,90],[122,92],[142,88]])a.prop('tc01',x,y,5,3);
  for(const [i,[x,y]] of [[22,22],[38,28],[66,32],[72,70],[104,82],[146,72],[146,20],[34,76]].entries())a.prop(['t01','t03','t10','t16'][i%4],x,y,2,2);
  a.grove(12,8,6,3,7);a.grove(12,82,6,3,13);a.grove(64,5,4,3,31);a.grove(112,5,7,3,43);a.grove(64,86,4,2,53);a.grove(116,85,7,2,71);
  return a.map;
}
function winter(){
  const a=author('winter','Frostline Outpost','Defend both sides of the frozen ridge. The upper pass is short; the lower approach offers a longer firing lane before the depot. Keep a reserve near the eastern merge.');
  // Staggered rock shoulders make a natural central massif, not a rectangular
  // courtyard. Both its upper and lower passes remain wide enough for a boss.
  for(const [name,x,y] of [['s01',48,44],['s03',56,40],['s03',64,40],['s03',72,36],['s04',80,36],['s02',88,40],['s17',48,52],['s18',56,52],['s23',64,48],['s09',76,48],['s17',88,52]] as const)a.stamp(name,x,y,true);
  a.solid({x:52,y:44,width:40,height:12});
  for(let y=0;y<24;y+=8)a.stamp('s25',96,y,true);
  for(let y=76;y<100;y+=8)a.stamp('s24',104,y,true);
  a.road(0,24,160);a.road(0,68,160);
  for(const [x,y] of [[12,40],[28,80],[60,12],[116,8],[116,84],[132,56]])a.stamp('p08',x,y);
  for(const [sprite,x,y] of [['v04',122,44],['v06',136,40],['v03',124,88],['v08',138,86]] as const)a.prop(sprite,x,y,sprite==='v08'?3:6,sprite==='v06'?3:5);
  for(const [x,y] of [[16,12],[28,10],[40,16],[68,14],[84,10],[116,12],[142,12],[16,92],[36,92],[60,88],[80,94],[94,84],[124,94],[146,86]])a.prop('tc02',x,y,5,3);
  for(const [x,y] of [[28,36],[38,62],[108,36],[142,52],[92,70]])a.prop('t16',x,y,2,2);
  a.grove(12,6,6,3,81);a.grove(60,5,5,3,93);a.grove(118,6,6,3,103);a.grove(12,86,6,2,117);a.grove(64,87,5,2,123);
  return a.map;
}
function interior(){
  const a=author('interior','Containment Works','Fall back through three work bays. Offset blast doors create overlapping firing positions; a maintenance bypass prevents one doorway from solving the whole level.');
  a.wall(44,0,8,36);a.wall(44,56,8,44);
  a.wall(88,0,8,48);a.wall(88,68,8,32);
  a.wall(120,0,8,32);a.wall(120,52,8,16);a.wall(120,84,8,16);
  a.wall(60,24,16,8);a.wall(60,72,16,8);a.wall(100,20,12,8);
  a.scenery.regions.push({x:52,y:32,width:36,height:40,sprite:'grating'},{x:96,y:48,width:24,height:20,sprite:'grating'},{x:128,y:32,width:32,height:52,sprite:'grating'});
  for(const [x,y,width] of [[40,36,16],[84,48,16],[116,32,16],[116,68,16]])for(let xx=x;xx<x+width;xx+=4)a.scenery.tiles.push({sprite:'strp0001',x:xx,y,columns:1,rows:1});
  for(const [x,y] of [[20,44],[32,44]])a.scenery.tiles.push({sprite:'arro0001',x,y,columns:1,rows:1});
  // Original crate stacks and drums sit beside walls, outside door approaches.
  for(const [i,[x,y]] of [[60,20],[64,20],[68,20],[60,80],[64,80],[100,16],[104,16],[132,8],[136,8],[140,8],[136,88],[140,88]].entries()){
    a.prop(['boxes01','boxes03','boxes05','brl3'][i%4],x+2,y+4,3,3);
  }
  return a.map;
}

/** New objects on every call: saves, structures, and previews never mutate the authored maps. */
export function campaignMap(level=1):WorldMap{return level<=1?forest():level===2?winter():interior();}
export function isCampaignMap(map:Pick<WorldMap,'id'>):boolean{return ['forest','winter','interior'].some(biome=>map.id===`pressure-front-${biome}-1`);}

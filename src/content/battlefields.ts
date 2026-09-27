import type {Biome,CurrentLane,MapScenery,Rect,WorldMap} from '../contracts/index.ts';
import {DEFAULT_MAP} from './index.ts';
import {damMap} from './dam.ts';
import {campaignMap} from './levels.ts';
import templates from '../../scripts/red-alert-terrain.json' with {type:'json'};

const entry=(side:NonNullable<WorldMap['entries']>[number]['side'],from=20,to=80)=>({side,from,to});
type Point=[number,number];
type MapOptions={goal?:{x:number;y:number};entries?:WorldMap['entries'];currents?:CurrentLane[];trees?:Point[];rocks?:Point[];roads?:[number,number,number][];verticalRoads?:[number,number,number][];water?:Rect[];villages?:Point[];groves?:[number,number,number,number,number][]};
function authored(id:string,title:string,briefing:string,biome:Biome,obstacles:Rect[],options:MapOptions={}):WorldMap{
 const scenery:MapScenery={biome,title,briefing,solids:[],mounts:obstacles.map(r=>({...r})),tiles:[],props:[],regions:[...(options.water??[]).map(r=>({...r,sprite:'water'}))]};
 const map:WorldMap={id:`pressure-front-${id}`,width:160,height:100,obstacles:obstacles.map(r=>({...r})),spawn:{x:0,y:20,width:8,height:60},entries:options.entries,currents:options.currents,goal:options.goal??{x:154,y:50},goalRadius:4,scenery};
 const outdoor=biome==='winter'?'winter':'forest';
 const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 const prop=(sprite:string,x:number,y:number,width:number,height:number)=>{
  const footprint={x:x-width/2,y:y-height,width,height};
  if(footprint.x<4||footprint.y<4||footprint.x+width>156||footprint.y+height>96||Math.hypot(x-map.goal.x,y-map.goal.y)<12||map.obstacles.some(r=>overlaps(r,footprint)))return;
  scenery.props.push({sprite:`${outdoor}:${sprite}`,x,y});scenery.solids.push(footprint);map.obstacles.push(footprint);
 };
 const tree=(x:number,y:number,seed:number)=>prop(['t01','t03','t10','t16','t17'][seed%5],x,y,2,2);
 for(const [i,[x,y]] of (options.trees??[]).entries())tree(x,y,i);
 for(const [x,y,columns,rows,seed] of options.groves??[])for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const hash=Math.imul(seed+col*13+row*37,2654435761)>>>0;if(hash%6===0)continue;
  tree(x+col*5+hash%3,y+row*5+(hash>>>4)%3,hash);
 }
 for(const [i,[x,y]] of (options.rocks??[]).entries()){
  const name=`s${String(1+i%27).padStart(2,'0')}`,layout=templates[name as keyof typeof templates];
  scenery.tiles.push({sprite:`${outdoor}:${name}`,x,y,columns:layout.columns,rows:layout.rows});
 }
 const road=(x:number,y:number,length:number,vertical=false)=>{for(let d=0;d<length;d+=4)scenery.tiles.push({sprite:`${outdoor}:${vertical?'d44':'d45'}`,x:x+(vertical?0:d),y:y+(vertical?d:0),columns:1,rows:1});};
 for(const [x,y,length] of options.roads??[])road(x,y,length);
 for(const [x,y,length] of options.verticalRoads??[])road(x,y,length,true);
 // Two staggered rows leave a usable main street through each hamlet.
 for(const [index,[x,y]] of (options.villages??[]).entries()){
  road(x-8,y,24);
  for(const [i,[dx,dy]] of [[-4,-3],[8,-5],[-2,12],[10,13]].entries())prop(['v01','v03','v04','v06','v08','v10'][(index*2+i)%6],x+dx,y+dy,6,5);
  tree(x-10,y+10,index+2);tree(x+16,y-6,index+3);
 }
 return map;
}

/** Four-unit wall cells describe an ellipse with generous, deliberate breaches. */
function ring(cx:number,cy:number,rx:number,ry:number,gates:'cross'|'diagonal'='cross',gap=18,thickness=6):Rect[]{
 const walls:Rect[]=[];
 for(let y=4;y<96;y+=4)for(let x=4;x<156;x+=4){
  const dx=x+2-cx,dy=y+2-cy,r=Math.hypot(dx/rx,dy/ry);
  if(r<1-thickness/Math.min(rx,ry)||r>1)continue;
  const passage=gates==='cross'?Math.min(Math.abs(dx),Math.abs(dy)):Math.min(Math.abs(dx/rx-dy/ry),Math.abs(dx/rx+dy/ry))*Math.min(rx,ry)/Math.SQRT2;
  if(passage<gap/2)continue;
  walls.push({x,y,width:4,height:4});
 }
 return walls;
}
const corners:[number,number,number,number,number][]=[[10,10,5,4,17],[126,10,5,4,31],[10,78,5,3,47],[126,78,5,3,63]];
function stronghold(id:string,title:string,briefing:string,biome:Biome,rx:number,ry:number,options:MapOptions&{gates?:'cross'|'diagonal';inner?:boolean;gap?:number}={}):WorldMap{
 const center=options.goal??{x:80,y:50};
 const walls=ring(center.x,center.y,rx,ry,options.gates,options.gap);
 if(options.inner)walls.push(...ring(center.x,center.y,18,18,options.gates==='diagonal'?'cross':'diagonal',16,4));
 return authored(id,title,briefing,biome,walls,{entries:FOUR_SIDES,...options,goal:center});
}

const FOUR_SIDES=[entry('west'),entry('east'),entry('north',32,128),entry('south',32,128)];
const woods=[[18,13],[30,87],[45,10],[66,91],[105,12],[128,88],[146,15],[13,64],[139,43]] as [number,number][];
const rocks=[[30,15],[50,70],[96,14],[128,70],[14,44],[145,50]] as [number,number][];

const redoubt=()=>stronghold('redoubt-ring','Redoubt Ring','A village fort under siege from all four sides. Four broad gates face the roads; orchards and cottages break up the outer approaches.','forest',32,30,{groves:corners,villages:[[26,46],[126,46]],roads:[[44,48,16],[100,48,16]],verticalRoads:[[78,4,16],[78,80,16]],rocks:[[48,16],[104,78]]});
const floodplain=()=>authored('floodplain','Floodplain Crossing','Two fast channels cut across the low ground. Their currents sweep crowds east; hold the gravel islands where the lanes pinch together.', 'forest',[
 {x:38,y:0,width:4,height:24},{x:38,y:42,width:4,height:16},{x:38,y:76,width:4,height:24},
 {x:76,y:0,width:4,height:18},{x:76,y:34,width:4,height:32},{x:76,y:82,width:4,height:18},
 {x:112,y:0,width:4,height:28},{x:112,y:46,width:4,height:18},{x:112,y:82,width:4,height:18},
],{trees:woods,groves:[[12,6,5,3,331],[122,84,5,2,347]],villages:[[54,46],[128,8]],rocks,water:[{x:0,y:24,width:160,height:18},{x:0,y:58,width:160,height:18}],currents:[
 {x:0,y:24,width:160,height:18,axis:'x',direction:{x:1,y:0},strength:18},
 {x:0,y:58,width:160,height:18,axis:'x',direction:{x:1,y:0},strength:14},
]});
const iceShelf=()=>stronghold('ice-shelf','Ice Shelf','A frozen oval redoubt above two meltwater pools. Four diagonal breaches force the swarm around the shelf; snowbound cottages shelter the western flank.','winter',40,28,{gates:'diagonal',groves:[[12,12,5,3,81],[128,74,5,4,93]],villages:[[22,44],[130,26]],water:[{x:56,y:4,width:48,height:12},{x:56,y:84,width:48,height:12}],rocks:[[44,20],[104,72],[44,72]],roads:[[60,48,40]]});
const switchyard=()=>stronghold('switchyard','Blackwater Switchyard','A circular depot guards the junction. East and west freight roads meet four wide breaches; workers’ cottages and wooded sidings create close-range ambushes.','forest',36,26,{gap:18,villages:[[24,26],[124,64]],groves:[[10,72,6,4,111],[126,8,5,3,125]],roads:[[0,48,160],[52,12,56],[52,84,56]],verticalRoads:[[78,4,16],[78,80,16]],rocks:[[42,30],[112,60]]});
const needle=()=>authored('needle-pass','Needle Pass','A narrow canyon feeds a broad final apron. The rock spurs create two short ambush pockets; keep the center open for heavy units.', 'winter',[
 {x:28,y:0,width:12,height:32},{x:28,y:48,width:12,height:52},{x:52,y:16,width:12,height:36},{x:52,y:68,width:12,height:32},
 {x:78,y:0,width:12,height:44},{x:78,y:60,width:12,height:40},{x:104,y:24,width:12,height:52},{x:130,y:0,width:8,height:36},{x:130,y:64,width:8,height:36},
],{villages:[[16,64],[116,80]],groves:[[8,8,3,3,389],[140,8,3,4,401]],rocks:[[24,12],[48,48],[74,16],[100,72],[126,12]],trees:[[17,82],[70,90],[117,10]]});
const crater=()=>stronghold('meteor-crater','Meteor Crater','A broken circular rim surrounds the survey relay. Diagonal cuts open into a broad crater floor; scattered outcrops and a remote survey village interrupt the exposed approaches.','winter',34,34,{gates:'diagonal',villages:[[20,46]],groves:[[124,10,5,3,141],[124,78,5,3,157]],rocks:[[56,24],[96,24],[52,68],[100,68],[76,12],[76,80]],roads:[[64,48,32]]});
const causeway=()=>authored('broken-causeway','Broken Causeway','A raised causeway spans the marsh, but its collapsed sections force the swarm onto narrow, exposed crossings.', 'forest',[
 {x:28,y:0,width:8,height:36},{x:28,y:48,width:8,height:52},{x:64,y:0,width:8,height:28},{x:64,y:40,width:8,height:60},
 {x:96,y:0,width:8,height:58},{x:96,y:70,width:8,height:30},{x:128,y:0,width:8,height:40},{x:128,y:52,width:8,height:48},
],{trees:woods,groves:[[12,8,5,3,359],[112,78,6,3,373]],villages:[[44,8],[108,8]],water:[{x:0,y:40,width:160,height:14}],currents:[{x:0,y:40,width:160,height:14,axis:'x',direction:{x:-1,y:0},strength:16}],roads:[[0,32,160],[0,64,160]],rocks:[[34,40],[72,28],[104,58]]});
const greenwall=()=>stronghold('greenwall','Greenwall Maze','An old ring fort reclaimed by forest. Dense groves hide the four approaches; village lanes and a clear inner orchard leave room to build a defense in depth.','forest',30,30,{groves:[...corners,[40,14,3,4,181],[106,68,3,4,193],[42,72,3,4,207],[106,10,3,4,219]],villages:[[22,46],[128,46]],verticalRoads:[[78,4,20],[78,76,20]],trees:[[66,38],[94,38],[66,66],[94,66]]});
const saltworks=()=>stronghold('saltworks','Saltworks Basin','A round salt-town refuge between two brine channels. Broad east and west gates carry the main assault; exposed northern and southern approaches cross the current.','forest',36,24,{gap:18,villages:[[24,44],[126,44]],groves:[[14,8,4,2,231],[132,84,4,2,249]],water:[{x:0,y:16,width:160,height:12},{x:0,y:72,width:160,height:12}],currents:[{x:0,y:16,width:160,height:12,axis:'x',direction:{x:1,y:0},strength:11},{x:0,y:72,width:160,height:12,axis:'x',direction:{x:-1,y:0},strength:11}],roads:[[0,48,160]],rocks:[[54,6],[104,86]]});
const twinPeaks=()=>stronghold('twin-peaks','Twin Peaks Relay','Two concentric ridges protect the mountain relay. The outer gates and inner diagonal cuts are staggered: divide your fire between the first ring and the final courtyard.','winter',44,36,{inner:true,gap:18,groves:[[10,8,4,4,263],[134,74,4,4,277]],villages:[[22,44],[130,44]],rocks:[[60,10],[92,80],[44,26],[108,66]],verticalRoads:[[78,4,16],[78,80,16]]});
const windbreak=()=>stronghold('windbreak-mesa','Windbreak Mesa','An off-center oval fort overlooks a farming village. Diagonal breaches catch the crosswind; the long western approach offers open fire lanes while eastern groves hide a shorter attack.','forest',36,30,{goal:{x:92,y:50},gates:'diagonal',villages:[[24,28],[24,64]],groves:[[128,12,5,3,291],[128,76,5,3,307],[48,8,5,2,319]],rocks:[[62,22],[110,74]],roads:[[52,48,48]],currents:[{x:40,y:30,width:88,height:40,axis:'y',direction:{x:.72,y:.35},strength:9}]});
const ringfort=()=>stronghold('last-keep','The Last Keep','Fall back through two circular curtain walls into the command court. Staggered breaches prevent a straight rush; abandoned villages and orchards surround the final strongpoint.','forest',40,36,{inner:true,gap:20,groves:corners,villages:[[22,44],[130,44]],roads:[[48,48,20],[92,48,20]],verticalRoads:[[78,0,16],[78,84,16]],rocks:[[46,16],[108,76]]});
const crossings=()=>authored('three-crossings','Three Crossings','Three stone bridges span a fast river. The center crossing is shortest; the north and south bridges let you redirect pressure with well-placed barriers.', 'forest',[
 {x:0,y:18,width:54,height:4},{x:70,y:18,width:90,height:4},{x:0,y:48,width:68,height:4},{x:84,y:48,width:48,height:4},{x:0,y:78,width:52,height:4},{x:68,y:78,width:92,height:4},
],{villages:[[20,28],[98,58]],groves:[[12,6,5,2,419],[114,86,6,2,431]],water:[{x:0,y:22,width:160,height:26},{x:0,y:52,width:160,height:26}],currents:[{x:0,y:22,width:160,height:26,axis:'x',direction:{x:1,y:0},strength:12},{x:0,y:52,width:160,height:26,axis:'x',direction:{x:1,y:0},strength:12}],trees:woods,rocks:[[50,24],[66,50],[48,78]]});

const newMaps=[redoubt,floodplain,iceShelf,switchyard,needle,crater,causeway,greenwall,saltworks,twinPeaks,windbreak,ringfort,crossings].map(make=>make());
export function allBattlefields():WorldMap[]{return [DEFAULT_MAP,campaignMap(1),campaignMap(2),campaignMap(3),damMap(),...newMaps].map(map=>structuredClone(map));}
export function battlefield(id:string|undefined):WorldMap{return allBattlefields().find(map=>map.id===id)??campaignMap(1);}
export function isSpecialBattlefield(map:Pick<WorldMap,'id'>):boolean{return map.id.startsWith('pressure-front-')&&!['pressure-front-bastion','pressure-front-forest-1','pressure-front-winter-1','pressure-front-interior-1','pressure-front-hydroelectric'].includes(map.id);}

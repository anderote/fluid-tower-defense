import type {Biome,CurrentLane,MapScenery,Rect,WorldMap} from '../contracts/index.ts';
import {DEFAULT_MAP} from './index.ts';
import {damMap} from './dam.ts';
import {campaignMap} from './levels.ts';

const entry=(side:NonNullable<WorldMap['entries']>[number]['side'],from=20,to=80)=>({side,from,to});
function authored(id:string,title:string,briefing:string,biome:Biome,obstacles:Rect[],options:{goal?:{x:number;y:number};entries?:WorldMap['entries'];currents?:CurrentLane[];trees?:[number,number][];rocks?:[number,number][];roads?:[number,number,number][];water?:Rect[]}={}):WorldMap{
 const scenery={biome,title,briefing,solids:[],mounts:obstacles.map(r=>({...r})),tiles:[] as MapScenery['tiles'],props:[] as {sprite:string;x:number;y:number}[],regions:[...(options.water??[]).map(r=>({...r,sprite:'water'}))]};
 for(const [i,[x,y]] of (options.trees??[]).entries())scenery.props.push({sprite:['forest:t01','forest:t03','forest:t10','forest:t16','forest:t17'][i%5],x,y});
 for(const [i,[x,y]] of (options.rocks??[]).entries())scenery.tiles.push({sprite:`${biome}:s${String(1+i%27).padStart(2,'0')}`,x,y,columns:2,rows:2});
 for(const [x,y,length] of options.roads??[])for(let xx=x;xx<x+length;xx+=4)scenery.tiles.push({sprite:`${biome}:d45`,x:xx,y,columns:1,rows:1});
 return {id:`pressure-front-${id}`,width:160,height:100,obstacles:obstacles.map(r=>({...r})),spawn:{x:0,y:20,width:8,height:60},entries:options.entries, currents:options.currents,goal:options.goal??{x:154,y:50},goalRadius:4,scenery};
}

const FOUR_SIDES=[entry('west'),entry('east'),entry('north',32,128),entry('south',32,128)];
const woods=[[18,13],[30,87],[45,10],[66,91],[105,12],[128,88],[146,15],[13,64],[139,43]] as [number,number][];
const rocks=[[30,15],[50,70],[96,14],[128,70],[14,44],[145,50]] as [number,number][];

const redoubt=()=>authored('redoubt-ring','Redoubt Ring','The fort is surrounded. Four gates feed a central kill court; split fire across the entrances or let the walls divide the horde.', 'forest',[
 {x:56,y:28,width:4,height:16},{x:56,y:56,width:4,height:16},{x:100,y:28,width:4,height:16},{x:100,y:56,width:4,height:16},
 {x:60,y:24,width:16,height:4},{x:84,y:24,width:16,height:4},{x:60,y:76,width:16,height:4},{x:84,y:76,width:16,height:4},
 {x:68,y:40,width:24,height:4},{x:68,y:56,width:24,height:4},
],{goal:{x:80,y:50},entries:FOUR_SIDES,trees:woods.slice(0,6),rocks:[[62,34],[94,62]]});
const floodplain=()=>authored('floodplain','Floodplain Crossing','Two fast channels cut across the low ground. Their currents sweep crowds east; hold the gravel islands where the lanes pinch together.', 'forest',[
 {x:38,y:0,width:4,height:24},{x:38,y:42,width:4,height:16},{x:38,y:76,width:4,height:24},
 {x:76,y:0,width:4,height:18},{x:76,y:34,width:4,height:32},{x:76,y:82,width:4,height:18},
 {x:112,y:0,width:4,height:28},{x:112,y:46,width:4,height:18},{x:112,y:82,width:4,height:18},
],{trees:woods,rocks,water:[{x:0,y:24,width:160,height:18},{x:0,y:58,width:160,height:18}],currents:[
 {x:0,y:24,width:160,height:18,axis:'x',direction:{x:1,y:0},strength:18},
 {x:0,y:58,width:160,height:18,axis:'x',direction:{x:1,y:0},strength:14},
]});
const iceShelf=()=>authored('ice-shelf','Ice Shelf','A cracked shelf leaves a quick northern shortcut and a safer southern loop. The central ice spine breaks long firing lines.', 'winter',[
 {x:46,y:26,width:52,height:8},{x:46,y:66,width:52,height:8},
 {x:60,y:34,width:8,height:12},{x:82,y:54,width:8,height:12},
 {x:112,y:0,width:8,height:36},{x:112,y:64,width:8,height:36},
],{rocks:[[46,28],[68,28],[86,68],[104,68],[22,54]],roads:[[0,18,112],[0,78,112]],trees:[[26,12],[40,88],[126,14],[143,84]]});
const switchyard=()=>authored('switchyard','Blackwater Switchyard','Three rail spurs divide the approach. The central sidings make strong firing nests, but every track crossing leaves a gap to cover.', 'interior',[
 {x:42,y:0,width:4,height:36},{x:42,y:52,width:4,height:48},{x:78,y:0,width:4,height:20},{x:78,y:36,width:4,height:28},{x:78,y:80,width:4,height:20},
 {x:104,y:0,width:4,height:42},{x:104,y:58,width:4,height:42},{x:126,y:38,width:18,height:4},{x:126,y:58,width:18,height:4},
],{roads:[[0,32,160],[0,64,160]],rocks:[[50,8],[84,84],[132,12]]});
const needle=()=>authored('needle-pass','Needle Pass','A narrow canyon feeds a broad final apron. The rock spurs create two short ambush pockets; keep the center open for heavy units.', 'winter',[
 {x:28,y:0,width:12,height:32},{x:28,y:48,width:12,height:52},{x:52,y:16,width:12,height:36},{x:52,y:68,width:12,height:32},
 {x:78,y:0,width:12,height:44},{x:78,y:60,width:12,height:40},{x:104,y:24,width:12,height:52},{x:130,y:0,width:8,height:36},{x:130,y:64,width:8,height:36},
],{rocks:[[24,12],[48,48],[74,16],[100,72],[126,12]],trees:[[17,82],[70,90],[117,10]]});
const crater=()=>authored('meteor-crater','Meteor Crater','Assaults converge on the ridge-top relay. The crater rim hides towers from distant lanes while four broken cuts give the horde routes to the center.', 'winter',[
 {x:48,y:22,width:20,height:4},{x:92,y:22,width:20,height:4},{x:48,y:74,width:20,height:4},{x:92,y:74,width:20,height:4},
 {x:44,y:30,width:4,height:18},{x:44,y:52,width:4,height:18},{x:112,y:30,width:4,height:18},{x:112,y:52,width:4,height:18},
 {x:68,y:38,width:8,height:4},{x:84,y:58,width:8,height:4},
],{goal:{x:80,y:50},entries:FOUR_SIDES,rocks:[[46,26],[104,26],[46,70],[104,70],[72,42],[84,54]]});
const causeway=()=>authored('broken-causeway','Broken Causeway','A raised causeway spans the marsh, but its collapsed sections force the swarm onto narrow, exposed crossings.', 'forest',[
 {x:28,y:0,width:8,height:36},{x:28,y:48,width:8,height:52},{x:64,y:0,width:8,height:28},{x:64,y:40,width:8,height:60},
 {x:96,y:0,width:8,height:58},{x:96,y:70,width:8,height:30},{x:128,y:0,width:8,height:40},{x:128,y:52,width:8,height:48},
],{trees:woods,water:[{x:0,y:40,width:160,height:14}],currents:[{x:0,y:40,width:160,height:14,axis:'x',direction:{x:-1,y:0},strength:16}],roads:[[0,32,160],[0,64,160]],rocks:[[34,40],[72,28],[104,58]]});
const greenwall=()=>authored('greenwall','Greenwall Maze','Old growth closes most of the field. Three deliberate corridors bend around the woods and merge at the eastern pump station.', 'forest',[
 {x:34,y:0,width:12,height:32},{x:34,y:48,width:12,height:52},{x:64,y:16,width:12,height:36},{x:64,y:68,width:12,height:32},
 {x:94,y:0,width:12,height:36},{x:94,y:52,width:12,height:48},{x:124,y:18,width:12,height:30},{x:124,y:62,width:12,height:38},
],{trees:[...woods,[54,14],[82,88],[116,12],[145,90],[18,26],[22,72]],roads:[[0,34,160],[0,66,160]]});
const saltworks=()=>authored('saltworks','Saltworks Basin','Shallow brine channels divide the flats. A broad central island can anchor your line, while the western side paths stay dangerously open.', 'interior',[
 {x:44,y:0,width:4,height:28},{x:44,y:46,width:4,height:54},{x:84,y:0,width:4,height:18},{x:84,y:36,width:4,height:48},{x:84,y:92,width:4,height:8},
 {x:118,y:0,width:4,height:38},{x:118,y:56,width:4,height:44},{x:58,y:36,width:12,height:4},{x:96,y:60,width:12,height:4},
],{water:[{x:0,y:24,width:160,height:18},{x:0,y:66,width:160,height:14}],currents:[{x:0,y:24,width:160,height:18,axis:'x',direction:{x:.8,y:.6},strength:13},{x:0,y:66,width:160,height:14,axis:'x',direction:{x:-.8,y:-.6},strength:13}],roads:[[0,46,160]],rocks:[[50,16],[72,76],[102,26],[136,78]]});
const twinPeaks=()=>authored('twin-peaks','Twin Peaks Relay','Two high ridges overlook a split approach. The eastern pass is direct; the western loop gives you time to build pressure before the lanes merge.', 'winter',[
 {x:34,y:18,width:8,height:24},{x:34,y:58,width:8,height:24},{x:56,y:0,width:12,height:38},{x:56,y:62,width:12,height:38},
 {x:82,y:22,width:10,height:18},{x:82,y:60,width:10,height:18},{x:108,y:0,width:8,height:36},{x:108,y:64,width:8,height:36},
 {x:130,y:0,width:8,height:40},{x:130,y:60,width:8,height:40},
],{rocks:[[30,20],[52,8],[78,24],[104,8],[126,20],[40,74],[68,86],[100,78],[140,52]],roads:[[0,44,160]]});
const windbreak=()=>authored('windbreak-mesa','Windbreak Mesa','Crosswinds sweep along the exposed ridge. Use the stone fins as sheltered firing points and keep a reserve near the central switchback.', 'forest',[
 {x:38,y:0,width:8,height:36},{x:38,y:52,width:8,height:48},{x:72,y:0,width:8,height:22},{x:72,y:38,width:8,height:62},
 {x:106,y:0,width:8,height:62},{x:106,y:78,width:8,height:22},{x:136,y:0,width:8,height:32},{x:136,y:48,width:8,height:52},
],{trees:woods,rocks:[[44,38],[80,20],[112,64],[140,34]],currents:[{x:24,y:0,width:120,height:100,axis:'y',direction:{x:.72,y:0.35},strength:9}]});
const ringfort=()=>authored('last-keep','The Last Keep','The outer ring is lost. Zombies pour in from every edge toward the command keep; defend the four breaches before the inner yard collapses.', 'interior',[
 {x:54,y:22,width:52,height:4},{x:54,y:74,width:52,height:4},{x:50,y:26,width:4,height:16},{x:50,y:58,width:4,height:16},{x:106,y:26,width:4,height:16},{x:106,y:58,width:4,height:16},
 {x:64,y:36,width:4,height:10},{x:92,y:36,width:4,height:10},{x:64,y:54,width:4,height:10},{x:92,y:54,width:4,height:10},
],{goal:{x:80,y:50},entries:FOUR_SIDES,rocks:[[52,18],[104,78],[52,78],[104,18]]});
const crossings=()=>authored('three-crossings','Three Crossings','Three stone bridges span a fast river. The center crossing is shortest; the north and south bridges let you redirect pressure with well-placed barriers.', 'forest',[
 {x:0,y:18,width:54,height:4},{x:70,y:18,width:90,height:4},{x:0,y:48,width:68,height:4},{x:84,y:48,width:48,height:4},{x:0,y:78,width:52,height:4},{x:68,y:78,width:92,height:4},
],{water:[{x:0,y:22,width:160,height:26},{x:0,y:52,width:160,height:26}],currents:[{x:0,y:22,width:160,height:26,axis:'x',direction:{x:1,y:0},strength:12},{x:0,y:52,width:160,height:26,axis:'x',direction:{x:1,y:0},strength:12}],trees:woods,rocks:[[50,24],[66,50],[48,78]]});

const newMaps=[redoubt,floodplain,iceShelf,switchyard,needle,crater,causeway,greenwall,saltworks,twinPeaks,windbreak,ringfort,crossings].map(make=>make());
export function allBattlefields():WorldMap[]{return [DEFAULT_MAP,campaignMap(1),campaignMap(2),campaignMap(3),damMap(),...newMaps].map(map=>structuredClone(map));}
export function battlefield(id:string|undefined):WorldMap{return allBattlefields().find(map=>map.id===id)??campaignMap(1);}
export function isSpecialBattlefield(map:Pick<WorldMap,'id'>):boolean{return map.id.startsWith('pressure-front-')&&!['pressure-front-bastion','pressure-front-forest-1','pressure-front-winter-1','pressure-front-interior-1','pressure-front-hydroelectric'].includes(map.id);}

import type {DamState,Rect,WorldMap} from '../contracts/index.ts';
export const DAM_ID='pressure-front-hydroelectric';
export const DAM_CHANNELS=[{x:32,y:16,width:100,height:16},{x:32,y:42,width:100,height:16},{x:32,y:68,width:100,height:16}] as const;
export const DAM_GATES:readonly Rect[]=[{x:64,y:16,width:4,height:16},{x:64,y:68,width:4,height:16}];
export const freshDam=():DamState=>({closed:[false,false],reservoir:100,surge:0,switchCooldown:0});
export const sameRect=(a:Rect,b:Rect)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
export const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function damMap():WorldMap{
 const platforms=[{x:32,y:0,width:100,height:16},{x:32,y:32,width:100,height:10},{x:32,y:58,width:100,height:10},{x:32,y:84,width:100,height:16}];
 return {id:DAM_ID,width:160,height:100,spawn:{x:0,y:20,width:8,height:60},goal:{x:154,y:50},goalRadius:4,obstacles:platforms.map(r=>({...r})),dam:freshDam(),scenery:{biome:'interior',title:'Thunderhead Dam',briefing:'Flood the north and south spillways, or close them to divert enemies. The dry central bypass is always open and needs tower coverage. Mount towers on the concrete islands.',solids:[],mounts:platforms.map(r=>({...r})),tiles:[],props:[],regions:[]}};
}
/** Gate openings must remain clear even while the gates are raised. */
export function inGateFootprint(map:WorldMap,rect:Rect):boolean{return map.id===DAM_ID&&DAM_GATES.some(g=>overlaps(g,rect));}
export function validDam(map:WorldMap):boolean{
 if(map.id!==DAM_ID)return map.dam===undefined;
 const d=map.dam;if(!d||!Array.isArray(d.closed)||d.closed.length!==2||!d.closed.every(v=>typeof v==='boolean'))return false;
 if(!Number.isFinite(d.reservoir)||d.reservoir<0||d.reservoir>100||!Number.isFinite(d.surge)||d.surge<0||d.surge>3.2||!Number.isFinite(d.switchCooldown)||d.switchCooldown<0||d.switchCooldown>3)return false;
 return DAM_GATES.every((gate,i)=>map.obstacles.filter(r=>sameRect(r,gate)).length===(d.closed[i]?1:0));
}

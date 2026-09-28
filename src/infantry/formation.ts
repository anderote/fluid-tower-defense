import type {Vec2} from '../contracts/index.ts';

export interface InfantryFormation {angle:number;columns:number}
export interface FormationPreview extends InfantryFormation {center:Vec2;positions:(Vec2&{valid:boolean})[];valid:boolean;rows:number}
export const FORMATION_SPACING=.9,FORMATION_DEPTH=.85;
/** Total War-style frontage: drag width sets files; all remaining troops fill ranks behind it. */
export function dragFormation(from:Vec2,to:Vec2,count:number):InfantryFormation&{center:Vec2;rows:number}{
  const width=Math.hypot(to.x-from.x,to.y-from.y);
  const columns=Math.max(1,Math.min(count,Math.floor(width/FORMATION_SPACING)+1));
  return {center:{x:(from.x+to.x)/2,y:(from.y+to.y)/2},angle:Math.atan2(to.y-from.y,to.x-from.x)-Math.PI/2,columns,rows:Math.ceil(count/columns)};
}
export function formationPoint(center:Vec2,slot:number,formation:InfantryFormation):Vec2 {
  const lateral=(slot%formation.columns-(formation.columns-1)/2)*FORMATION_SPACING,depth=Math.floor(slot/formation.columns)*FORMATION_DEPTH;
  return {x:center.x-Math.sin(formation.angle)*lateral-Math.cos(formation.angle)*depth,y:center.y+Math.cos(formation.angle)*lateral-Math.sin(formation.angle)*depth};
}
export const validFormation=(value:unknown):value is InfantryFormation=>!!value&&typeof value==='object'&&Number.isFinite((value as InfantryFormation).angle)&&Number.isSafeInteger((value as InfantryFormation).columns)&&(value as InfantryFormation).columns>=1&&(value as InfantryFormation).columns<=10000;

/** Ground footprint around every rank, including the space occupied by troop bodies. */
export function formationOutline(center:Vec2,formation:InfantryFormation,count:number):Vec2[]{
 const halfWidth=(formation.columns-1)*FORMATION_SPACING/2+.45,depth=(Math.max(1,Math.ceil(count/formation.columns))-1)*FORMATION_DEPTH;
 const fx=Math.cos(formation.angle),fy=Math.sin(formation.angle);
 return [[-halfWidth,-.45],[halfWidth,-.45],[halfWidth,depth+.45],[-halfWidth,depth+.45]].map(([lateral,rear])=>({x:center.x-fy*lateral-fx*rear,y:center.y+fx*lateral-fy*rear}));
}

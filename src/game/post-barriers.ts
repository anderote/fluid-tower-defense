import type {Rect,Vec2} from '../contracts/index.ts';

export const BARRIER_CELL=4;
export const MAX_POST_SPAN=16;
export type BarrierPost=Vec2;

const key=(point:Vec2)=>`${point.x}:${point.y}`;
const same=(left:Vec2,right:Vec2)=>left.x===right.x&&left.y===right.y;

/** One post per Red Alert construction cell, with stable top-left coordinates. */
export function barrierPostAt(point:Vec2,map:Pick<Rect,'width'|'height'>):BarrierPost{
  return {
    x:Math.max(0,Math.min(map.width-BARRIER_CELL,Math.floor(point.x/BARRIER_CELL)*BARRIER_CELL)),
    y:Math.max(0,Math.min(map.height-BARRIER_CELL,Math.floor(point.y/BARRIER_CELL)*BARRIER_CELL)),
  };
}

/**
 * Connect each post to the nearest aligned post in every cardinal direction.
 * A bounded span keeps the placement readable and prevents a single cheap post
 * from drawing a barrier across the battlefield.
 */
export function barrierCells(posts:readonly BarrierPost[],maxSpan=MAX_POST_SPAN):Rect[]{
  const unique=[...new Map(posts.map(post=>[key(post),post])).values()];
  const cells=new Map<string,Rect>();
  const add=(x:number,y:number)=>cells.set(`${x}:${y}`,{x,y,width:BARRIER_CELL,height:BARRIER_CELL});
  for(const post of unique){
    add(post.x,post.y);
    const aligned=unique.filter(other=>!same(post,other)&&(
      (other.x===post.x&&Math.abs(other.y-post.y)<=maxSpan)||
      (other.y===post.y&&Math.abs(other.x-post.x)<=maxSpan)
    ));
    const directions=[
      aligned.filter(other=>other.x===post.x&&other.y<post.y).sort((a,b)=>b.y-a.y)[0],
      aligned.filter(other=>other.x>post.x&&other.y===post.y).sort((a,b)=>a.x-b.x)[0],
      aligned.filter(other=>other.x===post.x&&other.y>post.y).sort((a,b)=>a.y-b.y)[0],
      aligned.filter(other=>other.x<post.x&&other.y===post.y).sort((a,b)=>b.x-a.x)[0],
    ].filter((other):other is BarrierPost=>!!other);
    for(const other of directions){
      const dx=Math.sign(other.x-post.x)*BARRIER_CELL,dy=Math.sign(other.y-post.y)*BARRIER_CELL;
      for(let x=post.x,y=post.y;x!==other.x||y!==other.y;x+=dx,y+=dy)add(x,y);
      add(other.x,other.y);
    }
  }
  return [...cells.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
}

export function addBarrierPost(posts:readonly BarrierPost[],post:BarrierPost):BarrierPost[]{
  return posts.some(existing=>same(existing,post))?[...posts]:[...posts,post];
}

export function removeBarrierPost(posts:readonly BarrierPost[],point:Vec2):BarrierPost[]{
  const post=barrierPostAt(point,{width:Number.MAX_SAFE_INTEGER,height:Number.MAX_SAFE_INTEGER});
  return posts.filter(existing=>!same(existing,post));
}

export function isBarrierPost(posts:readonly BarrierPost[],point:Vec2):boolean{
  return posts.some(post=>point.x>=post.x&&point.x<post.x+BARRIER_CELL&&point.y>=post.y&&point.y<post.y+BARRIER_CELL);
}

/** Carry surviving panel state across a topology rebuild. */
export function reconcileBarrier<T extends Rect>(cells:readonly Rect[],previous:readonly T[],create:(cell:Rect)=>T):T[]{
  return cells.map(cell=>previous.find(item=>item.x===cell.x&&item.y===cell.y&&item.width===cell.width&&item.height===cell.height)??create(cell));
}

/** Add only genuinely new topology, so a previously destroyed panel is not resurrected. */
export function extendBarrier<T extends Rect>(before:readonly BarrierPost[],after:readonly BarrierPost[],previous:readonly T[],create:(cell:Rect)=>T):{sections:T[];added:Rect[]}{
  const oldKeys=new Set(barrierCells(before).map(key)),target=barrierCells(after),targetKeys=new Set(target.map(key));
  const added=target.filter(cell=>!oldKeys.has(key(cell)));
  return {sections:[...previous.filter(item=>targetKeys.has(key(item))),...added.map(create)].sort((a,b)=>a.y-b.y||a.x-b.x),added};
}

/** Recycle either one clicked panel or a clicked post and its unsupported run. */
export function recycleBarrier<T extends Rect>(posts:readonly BarrierPost[],sections:readonly T[],point:Vec2):{posts:BarrierPost[];sections:T[];removed:T[];post:boolean}{
  const clicked=sections.find(section=>point.x>=section.x&&point.x<section.x+section.width&&point.y>=section.y&&point.y<section.y+section.height);
  if(!clicked)return {posts:[...posts],sections:[...sections],removed:[],post:false};
  const post=isBarrierPost(posts,point);
  if(!post)return {posts:[...posts],sections:sections.filter(section=>section!==clicked),removed:[clicked],post:false};
  const nextPosts=removeBarrierPost(posts,point),target=new Set(barrierCells(nextPosts).map(cell=>key(cell)));
  const kept=sections.filter(section=>target.has(key(section)));
  return {posts:nextPosts,sections:kept,removed:sections.filter(section=>!kept.includes(section)),post:true};
}

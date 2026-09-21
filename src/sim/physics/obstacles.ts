import type {Rect} from '../../contracts/index.ts';

export const OBSTACLE_CELL=8;
// Covers body radius + maximum substep displacement + contact margin.
export const OBSTACLE_PADDING=2;

/** Original obstacle order is preserved. Layout shares the existing storage
 * binding: rects, cell {start,length} records, then candidate-index records. */
export function packObstacleGrid(obstacles:readonly Rect[],width:number,height:number,approach:number){
 const columns=Math.ceil((width+approach)/OBSTACLE_CELL),rows=Math.ceil(height/OBSTACLE_CELL);
 const cells:number[][]=Array.from({length:columns*rows},()=>[]);
 obstacles.forEach((r,i)=>{
  const left=Math.max(0,Math.floor((r.x+approach-OBSTACLE_PADDING)/OBSTACLE_CELL)),right=Math.min(columns-1,Math.floor((r.x+r.width+approach+OBSTACLE_PADDING)/OBSTACLE_CELL));
  const top=Math.max(0,Math.floor((r.y-OBSTACLE_PADDING)/OBSTACLE_CELL)),bottom=Math.min(rows-1,Math.floor((r.y+r.height+OBSTACLE_PADDING)/OBSTACLE_CELL));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)cells[y*columns+x].push(i);
 });
 const entries=cells.reduce((n,c)=>n+c.length,0),data=new Float32Array((obstacles.length+cells.length+entries)*4);
 obstacles.forEach((r,i)=>data.set([r.x,r.y,r.width,r.height],i*4));
 let cursor=obstacles.length+cells.length;
 cells.forEach((list,i)=>{data.set([cursor,list.length],(obstacles.length+i)*4);for(const id of list){data[cursor*4]=id;cursor++;}});
 return {data,columns,rows,candidateEntries:entries};
}

export function sameObstacles(packed:Float32Array,obstacles:readonly Rect[]){
 if(packed.length!==obstacles.length*4)return false;
 return obstacles.every((r,i)=>packed[i*4]===Math.fround(r.x)&&packed[i*4+1]===Math.fround(r.y)&&packed[i*4+2]===Math.fround(r.width)&&packed[i*4+3]===Math.fround(r.height));
}

export type TouchPoint={x:number;y:number};
type Actions={tap:(p:TouchPoint)=>void;draw:(points:TouchPoint[])=>void;pan:(from:TouchPoint,to:TouchPoint)=>void;zoom:(factor:number,at:TouchPoint)=>void;canDraw:()=>boolean};
/** Defer game commands until release, so adding a second finger never builds a tower. */
export class TouchInput {
  private fingers=new Map<number,TouchPoint>();
  private path:TouchPoint[]=[];
  private multi=false;
  private moved=false;
  private actions:Actions;
  constructor(actions:Actions){this.actions=actions;}
  down(id:number,p:TouchPoint){this.fingers.set(id,p);if(this.fingers.size===1){this.path=[p];this.multi=false;this.moved=false;}else this.multi=true;}
  move(id:number,p:TouchPoint){
    const before=this.fingers.get(id);if(!before)return;
    const old=[...this.fingers.values()];this.fingers.set(id,p);
    const now=[...this.fingers.values()];
    if(now.length===2){
      const mid=(a:TouchPoint[])=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2});
      const distance=(a:TouchPoint[])=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      this.actions.pan(mid(old),mid(now));
      if(distance(old)>8)this.actions.zoom(distance(now)/distance(old),mid(now));
    }else if(!this.multi){
      this.path.push(p);
      if(Math.hypot(p.x-this.path[0].x,p.y-this.path[0].y)>8)this.moved=true;
      if(this.moved&&!this.actions.canDraw())this.actions.pan(before,p);
    }
  }
  up(id:number,p:TouchPoint){
    if(!this.fingers.has(id))return;
    if(!this.multi){if(!this.moved)this.actions.tap(p);else if(this.actions.canDraw())this.actions.draw([...this.path,p]);}
    this.fingers.delete(id);if(!this.fingers.size)this.path=[];
  }
  cancel(){this.fingers.clear();this.path=[];this.multi=false;}
}
export function attachTouchInput(canvas:HTMLCanvasElement,actions:Actions,arm:()=>void){
  const input=new TouchInput(actions);
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'] as const){
    canvas.addEventListener(type,event=>{
      if(event.pointerType!=='touch')return;
      event.preventDefault();event.stopImmediatePropagation();
      const p={x:event.clientX,y:event.clientY};
      if(type==='pointerdown'){arm();canvas.setPointerCapture(event.pointerId);input.down(event.pointerId,p);}
      else if(type==='pointermove')input.move(event.pointerId,p);
      else if(type==='pointerup')input.up(event.pointerId,p);
      else input.cancel();
    },{capture:true,passive:false});
  }
  window.addEventListener('blur',()=>input.cancel());
}

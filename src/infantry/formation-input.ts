import type {Vec2} from '../contracts/index.ts';

/** Right-click moves; right-drag previews a frontage and commits only on release. */
export function attachFormationPlacement(canvas:HTMLCanvasElement,options:{canStart:()=>boolean;point:(x:number,y:number)=>Vec2;preview:(from:Vec2,to:Vec2)=>void;clear:()=>void;commit:(from:Vec2,to?:Vec2)=>void}){
  let drag:{id:number;from:Vec2;x:number;y:number;wide:boolean}|undefined;
  const cancel=()=>{const id=drag?.id;drag=undefined;options.clear();if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);};
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==2){if(drag)cancel();return;}
    if(!options.canStart())return;
    event.preventDefault();event.stopImmediatePropagation();
    drag={id:event.pointerId,from:options.point(event.clientX,event.clientY),x:event.clientX,y:event.clientY,wide:false};
    if(event.isTrusted)canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!options.canStart()||!(event.buttons&2)){cancel();return;}
    event.preventDefault();event.stopImmediatePropagation();
    drag.wide=Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5;
    if(drag.wide)options.preview(drag.from,options.point(event.clientX,event.clientY));else options.clear();
  },true);
  canvas.addEventListener('pointerup',event=>{
    if(!drag||drag.id!==event.pointerId||event.button!==2)return;
    event.preventDefault();event.stopImmediatePropagation();const current=drag;
    const wide=Math.hypot(event.clientX-current.x,event.clientY-current.y)>5;
    cancel();if(options.canStart())options.commit(current.from,wide?options.point(event.clientX,event.clientY):undefined);
  },true);
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  window.addEventListener('blur',cancel);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
  return {cancel};
}

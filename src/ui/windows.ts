import './windows.css';

/** Shared window chrome; content remains in place so existing UI selectors work. */
export function makeGameWindow(element:HTMLElement,title:string,onClose?:()=>void){
  element.classList.add('game-window');
  const bar=document.createElement('div');bar.className='window-bar';
  const handle=document.createElement('button');handle.className='window-handle';handle.textContent=title;
  handle.setAttribute('aria-label','Move '+title);handle.title='Drag to move; arrow keys move 20px';
  const toggle=document.createElement('button');toggle.className='window-toggle';
  const setCollapsed=(collapsed:boolean)=>{
    element.classList.toggle('window-collapsed',collapsed);
    toggle.textContent=collapsed?'+':'−';toggle.setAttribute('aria-label',(collapsed?'Expand ':'Minimize ')+title);
    toggle.setAttribute('aria-expanded',String(!collapsed));
    if(element.parentElement?.matches('[aria-modal="true"]'))element.parentElement.classList.toggle('minimized-modal',collapsed);
    clamp();
  };
  bar.append(handle,toggle);element.prepend(bar);
  if(onClose){const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close '+title);close.onclick=onClose;bar.append(close);}
  const place=(x:number,y:number)=>{
    element.dataset.windowMoved='true';
    element.style.setProperty('position','fixed','important');
    element.style.setProperty('right','auto','important');element.style.setProperty('bottom','auto','important');
    element.style.setProperty('transform','none','important');
    const w=element.offsetWidth,h=element.offsetHeight;
    element.style.left=Math.max(4,Math.min(innerWidth-w-4,x))+'px';
    element.style.top=Math.max(4,Math.min(innerHeight-Math.min(h,innerHeight-8)-4,y))+'px';
  };
  function clamp(){if(element.dataset.windowMoved&&!element.hidden){const r=element.getBoundingClientRect();place(r.left,r.top);}}
  let drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    const r=element.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:r.left,top:r.top};
    handle.setPointerCapture(event.pointerId);element.classList.add('window-dragging');
  });
  handle.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)place(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);});
  const end=()=>{drag=undefined;element.classList.remove('window-dragging');};
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
  handle.addEventListener('keydown',event=>{
    const direction:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
    const delta=direction[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();
    const r=element.getBoundingClientRect();place(r.left+delta[0],r.top+delta[1]);
  });
  toggle.onclick=event=>{event.stopPropagation();setCollapsed(!element.classList.contains('window-collapsed'));};
  setCollapsed(false);window.addEventListener('resize',clamp);
  return {expand:()=>setCollapsed(false),clamp,destroy:()=>window.removeEventListener('resize',clamp)};
}

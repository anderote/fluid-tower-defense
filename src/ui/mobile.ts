import './mobile.css';
export function mountMobileUI(root:HTMLElement){
  const shell=root.querySelector<HTMLElement>('.pf')!;
  const toolbar=document.createElement('nav');toolbar.className='mobile-toolbar';toolbar.setAttribute('aria-label','Touch controls');
  toolbar.innerHTML='<button data-panel="build" aria-expanded="false">Build</button><button data-panel="wave" aria-expanded="false">Wave</button><button data-touch-mode="pan" aria-pressed="true">Pan</button><button data-touch-mode="select" aria-pressed="false">Select</button><button data-touch-mode="order" aria-pressed="false">Order</button><button data-touch-cancel>Cancel</button>';
  shell.append(toolbar);
  const rotate=document.createElement('section');rotate.className='rotate-gate';rotate.setAttribute('aria-label','Landscape play');
  rotate.innerHTML='<div class="rotate-device" aria-hidden="true">↻</div><h1>Turn your phone sideways</h1><p>Pressure Front plays in widescreen.<br>Rotate your phone to see the battlefield.</p><button data-landscape>Play fullscreen</button><small>Turn off portrait orientation lock if the screen does not rotate.</small>';
  shell.append(rotate);
  const fullscreen=async()=>{try{if(!document.fullscreenElement&&shell.requestFullscreen)await shell.requestFullscreen();const orientation=screen.orientation as ScreenOrientation&{lock?:(mode:string)=>Promise<void>};await orientation.lock?.('landscape');}catch{/* Safari uses physical device rotation instead. */}};
  rotate.querySelector<HTMLButtonElement>('[data-landscape]')!.onclick=fullscreen;
  const fullButton=document.createElement('button');fullButton.textContent='LANDSCAPE / FULLSCREEN';fullButton.onclick=fullscreen;root.querySelector('#view-menu')!.append(fullButton);

  const hint=document.createElement('div');hint.className='mobile-hint';hint.textContent='Tap to select / build · Drag to pan · Pinch to zoom';shell.append(hint);
  let mode='pan';
  const closePanels=()=>{delete shell.dataset.mobilePanel;toolbar.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));};
  toolbar.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>button.onclick=()=>{
    const open=shell.dataset.mobilePanel!==button.dataset.panel;closePanels();
    if(open){shell.classList.remove('controls-hidden');root.querySelector<HTMLElement>('aside')!.hidden=false;root.querySelector<HTMLElement>('.wave-command')!.hidden=false;shell.dataset.mobilePanel=button.dataset.panel;button.setAttribute('aria-expanded','true');const panel=root.querySelector(button.dataset.panel==='build'?'.body > aside':'.wave-command');if(panel?.classList.contains('window-collapsed'))panel.querySelector<HTMLButtonElement>('.window-toggle')?.click();}
  });
  const setMode=(value:string)=>{mode=value;toolbar.querySelectorAll<HTMLElement>('[data-touch-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.touchMode===value)));hint.textContent=value==='order'?'Tap a destination for selected units · Cancel to exit':value==='select'?'Drag a box to select units · Use Order to move them':'Tap to select / build · Drag to pan · Pinch to zoom';};
  toolbar.querySelectorAll<HTMLButtonElement>('[data-touch-mode]').forEach(b=>b.onclick=()=>{closePanels();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));setMode(b.dataset.touchMode!);});
  // Order preserves the selected units; it must not run the cancel action.
  toolbar.querySelector<HTMLButtonElement>('[data-touch-mode="order"]')!.onclick=()=>{closePanels();setMode(mode==='order'?'pan':'order');};
  toolbar.querySelector<HTMLButtonElement>('[data-touch-cancel]')!.onclick=()=>{closePanels();setMode('pan');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));};
  root.addEventListener('click',event=>{const target=(event.target as Element).closest('[data-tower],.defense-tools button,[data-infantry="build"],[data-infantry="rally"],[data-action="move"],[data-action="set-ground-target"]');if(target){closePanels();setMode('pan');}});
  return {mode:()=>mode,closePanels};
}

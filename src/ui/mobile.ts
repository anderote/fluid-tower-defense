import './mobile.css';
export function mountMobileUI(root:HTMLElement){
  const shell=root.querySelector<HTMLElement>('.pf')!;
  const preference='pressure-front.layout.v1';
  let saved:string|null=null;try{saved=localStorage.getItem(preference);}catch{}
  let mobileLayout=saved?saved==='mobile':matchMedia('(pointer: coarse), (max-width:900px)').matches;
  const switchButton=document.createElement('button');switchButton.className='layout-switch';
  let verticalScroll=false;try{verticalScroll=localStorage.getItem('pressure-front.vertical-scroll.v1')==='true';}catch{}
  const scrollButton=document.createElement('button');scrollButton.className='scroll-layout-switch';

  const applyLayout=()=>{delete shell.dataset.mobilePanel;document.documentElement.classList.toggle('mobile-layout',mobileLayout);document.documentElement.classList.toggle('vertical-scroll',mobileLayout&&verticalScroll);scrollButton.hidden=!mobileLayout;scrollButton.textContent=verticalScroll?'Game view':'Vertical scroll';scrollButton.setAttribute('aria-label',verticalScroll?'Use game view':'Use vertical scrolling');switchButton.textContent=mobileLayout?'Desktop':'Mobile';switchButton.setAttribute('aria-label',mobileLayout?'Switch to desktop mode':'Switch to mobile mode');window.dispatchEvent(new Event('game-layout-change'));};
  const toggleLayout=()=>{mobileLayout=!mobileLayout;try{localStorage.setItem(preference,mobileLayout?'mobile':'desktop');}catch{}applyLayout();};
  switchButton.onclick=toggleLayout;
    scrollButton.onclick=()=>{verticalScroll=!verticalScroll;for(const panel of root.querySelectorAll<HTMLElement>('.body > aside,.wave-command')){panel.hidden=false;if(panel.classList.contains('window-collapsed'))panel.querySelector<HTMLButtonElement>('.window-toggle')?.click();}try{localStorage.setItem('pressure-front.vertical-scroll.v1',String(verticalScroll));}catch{}applyLayout();window.scrollTo(0,0);};
  root.querySelector('.header-actions')!.prepend(scrollButton,switchButton);applyLayout();

  const toolbar=document.createElement('nav');toolbar.className='mobile-toolbar';toolbar.setAttribute('aria-label','Touch controls');
  toolbar.innerHTML='<button data-panel="build" aria-expanded="false">Build</button><button data-panel="wave" aria-expanded="false">Wave</button><button data-touch-mode="pan" aria-pressed="true">Pan</button><button data-touch-mode="select" aria-pressed="false">Select</button><button data-touch-mode="order" aria-pressed="false">Order</button><button data-touch-cancel>Cancel</button>';
  shell.append(toolbar);
  const hint=document.createElement('div');hint.className='mobile-hint';hint.textContent='Tap to select / build · Drag to pan · Pinch to zoom';shell.append(hint);
  let mode='pan';
  const closePanels=()=>{delete shell.dataset.mobilePanel;toolbar.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));};
  toolbar.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>button.onclick=()=>{
    if(mobileLayout&&verticalScroll){root.querySelector(button.dataset.panel==='build'?'.body > aside':'.wave-command')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const open=shell.dataset.mobilePanel!==button.dataset.panel;closePanels();
    if(open){shell.classList.remove('controls-hidden');root.querySelector<HTMLElement>('aside')!.hidden=false;root.querySelector<HTMLElement>('.wave-command')!.hidden=false;shell.dataset.mobilePanel=button.dataset.panel;button.setAttribute('aria-expanded','true');const panel=root.querySelector(button.dataset.panel==='build'?'.body > aside':'.wave-command');if(panel?.classList.contains('window-collapsed'))panel.querySelector<HTMLButtonElement>('.window-toggle')?.click();}
  });
  const setMode=(value:string)=>{mode=value;toolbar.querySelectorAll<HTMLElement>('[data-touch-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.touchMode===value)));hint.textContent=value==='order'?'Tap a destination for selected units · Cancel to exit':value==='select'?'Drag a box to select units · Use Order to move them':'Tap to select / build · Drag to pan · Pinch to zoom';};
  toolbar.querySelectorAll<HTMLButtonElement>('[data-touch-mode]').forEach(b=>b.onclick=()=>{closePanels();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));setMode(b.dataset.touchMode!);});
  // Order preserves the selected units; it must not run the cancel action.
  toolbar.querySelector<HTMLButtonElement>('[data-touch-mode="order"]')!.onclick=()=>{closePanels();setMode(mode==='order'?'pan':'order');};
  toolbar.querySelector<HTMLButtonElement>('[data-touch-cancel]')!.onclick=()=>{closePanels();setMode('pan');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));};
  root.addEventListener('click',event=>{const target=(event.target as Element).closest('[data-tower],.defense-tools button,[data-infantry="build"],[data-infantry="rally"],[data-action="move"],[data-action="set-ground-target"]');if(target){closePanels();setMode('pan');if(mobileLayout&&verticalScroll)root.querySelector('.arena')?.scrollIntoView({behavior:'smooth',block:'start'});}});
  return {mode:()=>mode,closePanels};
}

import {AdaptiveResolution,graphicsQuality} from '../runtime/quality.ts';
export function mountGraphicsSettings(root:HTMLElement){
 const quality=new AdaptiveResolution(),key='pressure-front.graphics.v1';
 try{quality.setMode(graphicsQuality(localStorage.getItem(key)));}catch{/* Optional preference persistence. */}
 const label=document.createElement('label');label.className='audio-setting';label.textContent='BATTLEFIELD DETAIL';
 const select=document.createElement('select');select.setAttribute('aria-label','Battlefield detail');
 for(const [value,text] of [['auto','Automatic'],['high','High'],['balanced','Balanced'],['performance','Performance']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
 select.value=quality.mode;label.append(select);
 const panel=root.querySelector('#settings-gate > section')!;panel.insertBefore(label,panel.querySelector(':scope > button[data-settings-close]'));
 const hint=document.createElement('p');hint.textContent='Adjusts battlefield sharpness. Menus stay sharp; combat rules stay the same.';label.after(hint);
 root.querySelector('#settings-title')!.textContent='SETTINGS';
 select.addEventListener('change',()=>{quality.setMode(graphicsQuality(select.value));try{localStorage.setItem(key,quality.mode);}catch{/* Optional. */}});
 return quality;
}

export type AudioSetting = 'music'|'effects';
export type AudioSettings = Record<AudioSetting,number>;

const SETTINGS_KEY='pressure-front.audio-settings.v1';
const defaults:AudioSettings={music:.3,effects:.48};
let settings=loadSettings();
const listeners=new Set<(settings:Readonly<AudioSettings>)=>void>();

function clamp(value:unknown,fallback:number){
  return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
}

function loadSettings():AudioSettings{
  try{
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)??'null') as Partial<AudioSettings>|null;
    return {music:clamp(saved?.music,defaults.music),effects:clamp(saved?.effects,defaults.effects)};
  }catch{return {...defaults};}
}

function saveSettings(){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Local preferences are optional. */}
}

export function audioSettings():Readonly<AudioSettings>{return settings;}

export function setAudioSetting(setting:AudioSetting,value:number){
  settings={...settings,[setting]:clamp(value,settings[setting])};
  saveSettings();
  for(const listener of listeners)listener(settings);
}

export function onAudioSettingsChange(listener:(settings:Readonly<AudioSettings>)=>void){
  listeners.add(listener);
  return()=>listeners.delete(listener);
}

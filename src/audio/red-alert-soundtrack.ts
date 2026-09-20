const STATE_KEY='pressure-front.red-alert-soundtrack.v1';

const FILES=[
  '01_Hell March.mp3','02_Radio 2.mp3','03 Crush.mp3','04 Roll Out.mp3','05 Mud.mp3','06 Twin Cannon.mp3',
  '07 Face the Enemy.mp3','08 Run.mp3','09 Terminate.mp3','10 Big Foot.mp3','11 Workmen.mp3','12 Militant Force.mp3',
  '13 Dense.mp3','14 Vector.mp3','15 Smash.mp3','16 Menu Theme (Rare Track).mp3','17 Face the Enemy 1 (Rare Track).mp3',
  '18 Fogger (Rare Track).mp3','19 Trenches (Rare Track).mp3','20 Reload Fire (Rare Track).mp3','21 Snake (Rare Track).mp3','22 Surf No Mercy (Rare Track).mp3',
] as const;

export const redAlertTracks=FILES.map((file,index)=>({
  file,
  number:index+1,
  title:file.replace(/^\d+[_ ]/,'').replace(/\.mp3$/,'').replace(/ \(Rare Track\)$/,' — Rare Track'),
  url:`/audio/red-alert/${encodeURIComponent(file)}`,
}));

type SavedPlayback={track:number;time:number;volume:number;wasPlaying:boolean};

const RED_ALERT_SOUNDTRACK_MARKUP='<div class="music-info"><label>RED ALERT SOUNDTRACK <span id="music-count"></span></label><p id="music-track"></p></div><div class="music-actions"><button data-music="toggle">PLAY</button><button data-music="next">NEXT</button></div><label class="music-volume">VOLUME <input id="music-volume" type="range" min="0" max="1" step="0.05" value="0.3" aria-label="Music volume"></label>';

function savedPlayback():SavedPlayback{
  try{
    const value=JSON.parse(localStorage.getItem(STATE_KEY)??'null') as Partial<SavedPlayback>|null;
    return {track:Number.isInteger(value?.track)&&value!.track!>=0&&value!.track!<redAlertTracks.length?value!.track!:0,time:Number.isFinite(value?.time)?Math.max(0,value!.time!):0,volume:Number.isFinite(value?.volume)?Math.max(0,Math.min(1,value!.volume!)):.3,wasPlaying:!!value?.wasPlaying};
  }catch{return {track:0,time:0,volume:.3,wasPlaying:false};}
}

/** Mounts the bundled Red Alert soundtrack player. Playback begins after a user gesture. */
export function mountRedAlertSoundtrack(root:HTMLElement):()=>void{
  const panel=root.querySelector<HTMLElement>('.soundtrack')??document.createElement('section');panel.className='soundtrack';panel.setAttribute('aria-label','Red Alert music player');
  if(!panel.children.length)panel.innerHTML=RED_ALERT_SOUNDTRACK_MARKUP;
  if(!panel.isConnected)root.querySelector('.simulation-controls')?.append(panel);
  const toggle=panel.querySelector<HTMLButtonElement>('[data-music="toggle"]')!,next=panel.querySelector<HTMLButtonElement>('[data-music="next"]')!,volume=panel.querySelector<HTMLInputElement>('#music-volume')!,count=panel.querySelector<HTMLElement>('#music-count')!,title=panel.querySelector<HTMLElement>('#music-track')!;
  const saved=savedPlayback(),audio=new Audio();audio.preload='metadata';audio.volume=saved.volume;volume.value=String(saved.volume);
  let index=saved.track,wantsPlay=saved.wasPlaying,destroyed=false,lastSave=0;
  const save=()=>{if(destroyed)return;try{localStorage.setItem(STATE_KEY,JSON.stringify({track:index,time:Number.isFinite(audio.currentTime)?audio.currentTime:0,volume:audio.volume,wasPlaying:wantsPlay&&!audio.ended} satisfies SavedPlayback));}catch{/* Playback persistence is optional. */}};
  const render=(message?:string,error=false)=>{
    const track=redAlertTracks[index];count.textContent=`${track.number} / ${redAlertTracks.length}`;
    title.textContent=message??track.title;title.classList.toggle('error',error);title.title=title.textContent;
    toggle.setAttribute('aria-label',audio.paused?'Play music':'Pause music');next.setAttribute('aria-label','Next track');toggle.textContent=audio.paused?'PLAY':'PAUSE';
  };
  const play=async()=>{wantsPlay=true;try{await audio.play();render();}catch{render('Click PLAY to start the soundtrack.');}};
  const select=(nextIndex:number,resumeTime=0)=>{
    index=(nextIndex+redAlertTracks.length)%redAlertTracks.length;audio.src=redAlertTracks[index].url;audio.load();
    if(resumeTime>0)audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.min(resumeTime,Math.max(0,(audio.duration||resumeTime)-.25));save();},{once:true});
    render();
  };
  const advance=()=>{select(index+1);void play();};
  const togglePlayback=()=>{if(audio.paused)void play();else{wantsPlay=false;audio.pause();save();}};
  const resumeAfterGesture=()=>{if(wantsPlay&&audio.paused)void play();};
  select(index,saved.time);render(wantsPlay?'Soundtrack restored. Click anywhere to resume.':undefined);
  toggle.addEventListener('click',togglePlayback);next.addEventListener('click',advance);volume.addEventListener('input',()=>{audio.volume=Number(volume.value);save();});
  audio.addEventListener('ended',advance);audio.addEventListener('play',()=>{wantsPlay=true;render();save();});audio.addEventListener('pause',()=>{render();save();});audio.addEventListener('timeupdate',()=>{const now=performance.now();if(now-lastSave>1000){save();lastSave=now;}});audio.addEventListener('error',()=>render(`Could not play ${redAlertTracks[index].title}.`,true));
  document.addEventListener('pointerdown',resumeAfterGesture);document.addEventListener('keydown',resumeAfterGesture);window.addEventListener('pagehide',save);
  return()=>{save();destroyed=true;audio.pause();audio.removeAttribute('src');audio.load();toggle.removeEventListener('click',togglePlayback);next.removeEventListener('click',advance);document.removeEventListener('pointerdown',resumeAfterGesture);document.removeEventListener('keydown',resumeAfterGesture);window.removeEventListener('pagehide',save);panel.remove();};
}

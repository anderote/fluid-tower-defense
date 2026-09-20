const STATE_KEY='pressure-front.local-soundtrack.v1';
const DB_NAME='pressure-front-local-soundtrack';
const HANDLE_KEY='music-folder';
const AUDIO_FILE=/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;

type SavedPlayback={path:string;time:number;volume:number;wasPlaying:boolean};
type LocalTrack={file:File;path:string;url:string};
type DirectoryHandle=FileSystemDirectoryHandle&{
  values():AsyncIterableIterator<FileSystemFileHandle|DirectoryHandle>;
  queryPermission(options:{mode:'read'}):Promise<PermissionState>;
  requestPermission(options:{mode:'read'}):Promise<PermissionState>;
};
type PickerWindow=Window&typeof globalThis&{showDirectoryPicker?:()=>Promise<DirectoryHandle>};

export function isLocalAudioFile(file:Pick<File,'name'|'type'>):boolean{
  return !file.name.startsWith('._')&&(file.type.startsWith('audio/')||AUDIO_FILE.test(file.name));
}

function savedPlayback():SavedPlayback{
  try{
    const value=JSON.parse(localStorage.getItem(STATE_KEY)??'null') as Partial<SavedPlayback>|null;
    return {path:value?.path??'',time:Number.isFinite(value?.time)?Math.max(0,value!.time!):0,volume:Number.isFinite(value?.volume)?Math.max(0,Math.min(1,value!.volume!)):.3,wasPlaying:!!value?.wasPlaying};
  }catch{return {path:'',time:0,volume:.3,wasPlaying:false};}
}

function folderDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('handles');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function storedFolder():Promise<DirectoryHandle|undefined>{
  try{
    const db=await folderDatabase();
    return await new Promise<DirectoryHandle|undefined>((resolve,reject)=>{const request=db.transaction('handles').objectStore('handles').get(HANDLE_KEY);request.onsuccess=()=>resolve(request.result as DirectoryHandle|undefined);request.onerror=()=>reject(request.error);}).finally(()=>db.close());
  }catch{return undefined;}
}

async function storeFolder(handle:DirectoryHandle):Promise<void>{
  try{
    const db=await folderDatabase();
    await new Promise<void>((resolve,reject)=>{const request=db.transaction('handles','readwrite').objectStore('handles').put(handle,HANDLE_KEY);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);}).finally(()=>db.close());
  }catch{/* Folder persistence is an enhancement; playback still works this session. */}
}

async function filesInFolder(folder:DirectoryHandle,prefix=''):Promise<{file:File;path:string}[]>{
  const files:{file:File;path:string}[]=[];
  for await(const entry of folder.values()){
    const path=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.kind==='file'){
      const file=await (entry as FileSystemFileHandle).getFile();
      if(isLocalAudioFile(file))files.push({file,path});
    }else files.push(...await filesInFolder(entry as DirectoryHandle,path));
  }
  return files.sort((left,right)=>left.path.localeCompare(right.path,undefined,{numeric:true,sensitivity:'base'}));
}

/** Mounts a browser-local jukebox. Selected audio never leaves the browser. */
export function mountLocalSoundtrack(root:HTMLElement):()=>void{
  const panel=document.createElement('section');panel.className='soundtrack';panel.setAttribute('aria-label','Music player');
  panel.innerHTML='<div class="music-info"><label>LOCAL SOUNDTRACK <span id="music-count">NO FILES</span></label><p id="music-track">Choose a folder of local audio files. Nothing is uploaded.</p></div><input id="music-folder" type="file" accept="audio/*,.aac,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav" multiple hidden webkitdirectory><div class="music-actions"><button data-music="load">CHOOSE FOLDER</button><button data-music="toggle" disabled>PLAY</button><button data-music="next" disabled>NEXT</button></div><label class="music-volume">VOLUME <input id="music-volume" type="range" min="0" max="1" step="0.05" value="0.3" aria-label="Music volume"></label>';
  root.querySelector('.view-actions')?.insertAdjacentElement('beforebegin',panel);
  const input=panel.querySelector<HTMLInputElement>('#music-folder')!,load=panel.querySelector<HTMLButtonElement>('[data-music="load"]')!,toggle=panel.querySelector<HTMLButtonElement>('[data-music="toggle"]')!,next=panel.querySelector<HTMLButtonElement>('[data-music="next"]')!,volume=panel.querySelector<HTMLInputElement>('#music-volume')!,count=panel.querySelector<HTMLElement>('#music-count')!,title=panel.querySelector<HTMLElement>('#music-track')!;
  const audio=new Audio();audio.preload='metadata';
  const saved=savedPlayback();audio.volume=saved.volume;volume.value=String(saved.volume);
  let tracks:LocalTrack[]=[],index=-1,folder:DirectoryHandle|undefined,wantsPlay=saved.wasPlaying,destroyed=false,lastSave=0;
  const displayName=(track:LocalTrack)=>track.file.name.replace(/\.[^.]+$/,'');
  const save=()=>{if(destroyed)return;const track=tracks[index];try{localStorage.setItem(STATE_KEY,JSON.stringify({path:track?.path??saved.path,time:Number.isFinite(audio.currentTime)?audio.currentTime:0,volume:audio.volume,wasPlaying:wantsPlay&&!audio.ended} satisfies SavedPlayback));}catch{/* Playback persistence is optional. */}};
  const render=(message?:string,error=false)=>{
    count.textContent=tracks.length?`${index+1} / ${tracks.length}`:'NO FILES';
    title.textContent=message??(tracks[index]?displayName(tracks[index]):folder?'Folder access is needed to restore the soundtrack.':'Choose a folder of local audio files. Nothing is uploaded.');
    title.classList.toggle('error',error);title.title=title.textContent;
    toggle.setAttribute('aria-label',audio.paused?'Play music':'Pause music');
    next.setAttribute('aria-label','Next track');
    toggle.disabled=next.disabled=!tracks.length;
    toggle.textContent=audio.paused?'PLAY':'PAUSE';
    load.textContent=folder&&!tracks.length?'RECONNECT FOLDER':'CHOOSE FOLDER';
  };
  const release=()=>{audio.pause();audio.removeAttribute('src');audio.load();for(const track of tracks)URL.revokeObjectURL(track.url);tracks=[];index=-1;};
  const play=async()=>{if(!tracks.length)return;wantsPlay=true;try{await audio.play();render();}catch{render('Click PLAY to resume local music.');}};
  const select=(nextIndex:number,resumeTime=0)=>{
    if(!tracks.length)return;index=(nextIndex+tracks.length)%tracks.length;audio.src=tracks[index].url;audio.load();
    if(resumeTime>0)audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.min(resumeTime,Math.max(0,(audio.duration||resumeTime)-.25));save();},{once:true});
    render();
  };
  const advance=()=>{if(!tracks.length)return;select(index+1);void play();};
  const install=(files:{file:File;path:string}[])=>{
    const prior=savedPlayback();release();tracks=files.filter(item=>isLocalAudioFile(item.file)).sort((left,right)=>left.path.localeCompare(right.path,undefined,{numeric:true,sensitivity:'base'})).map(item=>({...item,url:URL.createObjectURL(item.file)}));
    if(!tracks.length){render('No supported audio files were found in that folder.',true);return;}
    const match=tracks.findIndex(track=>track.path===prior.path||track.file.name===prior.path);select(Math.max(0,match),match>=0?prior.time:0);wantsPlay=prior.wasPlaying;render(wantsPlay?'Soundtrack restored. Click anywhere to resume.':undefined);if(wantsPlay)void play();
  };
  const connect=async()=>{
    try{
      if(folder&&!tracks.length&&await folder.requestPermission({mode:'read'})==='granted'){install(await filesInFolder(folder));return;}
      const picker=(window as PickerWindow).showDirectoryPicker;
      if(picker){folder=await picker.call(window);await storeFolder(folder);install(await filesInFolder(folder));}
      else{input.value='';input.click();}
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;render('Could not read that music folder.',true);}
  };
  const inputChanged=()=>{const files=Array.from(input.files??[]);install(files.map(file=>({file,path:file.webkitRelativePath||file.name})));};
  const togglePlayback=()=>{if(audio.paused)void play();else{wantsPlay=false;audio.pause();save();}};
  const setVolume=()=>{audio.volume=Number(volume.value);save();};
  const resumeAfterGesture=()=>{if(wantsPlay&&tracks.length&&audio.paused)void play();};
  load.addEventListener('click',connect);input.addEventListener('change',inputChanged);toggle.addEventListener('click',togglePlayback);next.addEventListener('click',advance);volume.addEventListener('input',setVolume);
  audio.addEventListener('ended',advance);audio.addEventListener('play',()=>{wantsPlay=true;render();save();});audio.addEventListener('pause',()=>{render();save();});audio.addEventListener('timeupdate',()=>{const now=performance.now();if(now-lastSave>1000){save();lastSave=now;}});audio.addEventListener('error',()=>{render(`Could not play ${tracks[index]?.file.name??'this file'}.`,true);});
  document.addEventListener('pointerdown',resumeAfterGesture);document.addEventListener('keydown',resumeAfterGesture);window.addEventListener('pagehide',save);render();
  void storedFolder().then(async handle=>{if(destroyed||!handle)return;folder=handle;if(await handle.queryPermission({mode:'read'})==='granted')install(await filesInFolder(handle));else render();}).catch(()=>render());
  return()=>{save();destroyed=true;release();load.removeEventListener('click',connect);input.removeEventListener('change',inputChanged);toggle.removeEventListener('click',togglePlayback);next.removeEventListener('click',advance);volume.removeEventListener('input',setVolume);document.removeEventListener('pointerdown',resumeAfterGesture);document.removeEventListener('keydown',resumeAfterGesture);window.removeEventListener('pagehide',save);panel.remove();};
}

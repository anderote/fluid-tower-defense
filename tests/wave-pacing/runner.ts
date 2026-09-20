import {campaignMap} from '../../src/content/levels.ts';
import {createRun} from '../../src/game/index.ts';
import {AUTOSAVE_KEY} from '../../src/persistence/defense.ts';
import {backupSaves,restoreSaves} from '../e2e/storage.ts';
const button=document.querySelector<HTMLButtonElement>('#run')!,status=document.querySelector('#status')!,frame=document.querySelector<HTMLIFrameElement>('#game')!;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const text=(selector:string)=>frame.contentDocument?.querySelector(selector)?.textContent??'';
async function until(check:()=>boolean,timeout:number){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error('Timed out: '+text('.diagnostics pre'));await sleep(100);}}
async function navigate(path:string){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Frame load timed out')),12000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.src=path;});}
button.onclick=async()=>{
 button.disabled=true;let backed=false;
 try{
  backupSaves(localStorage);backed=true;
  for(const key of Object.keys(localStorage))if(key.startsWith('pressure-front.'))localStorage.removeItem(key);
  const map=campaignMap(1),walls=[40,44,48,52].map(y=>({x:48,y,width:4,height:4}));
  map.obstacles.push(...walls);
  const run=createRun(map);run.setBuildMounts(walls);assert(run.spendMetal(walls.length*60).ok,'Wall budget failed');
  for(const [kind,x,y] of [['tesla',42,42],['tesla',42,58],['mortar',64,46],['incinerator',64,58],['repulsor',50,50],['repulsor',54,58],['autocannon',104,26],['autocannon',104,78]] as const)assert(run.place(kind,{x,y}).ok,'Invalid test defense '+kind+' '+x+','+y);
  localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState:run.save(),map,spawnBaseline:map.spawn,builtWalls:walls,builtWires:[],difficulty:1,streamWidth:60}));
  await navigate('/');await until(()=>text('#adapter').includes('/ WEBGPU'),12000);
  assert(text('#wave-status-count')==='1,200 enemies','Opening forecast is wrong');
  const width=frame.contentDocument!.querySelector<HTMLInputElement>('[aria-label="Zombie stream width"]')!;
  for(const value of [1,100,60]){width.value=String(value);width.dispatchEvent(new Event('input',{bubbles:true}));assert(text('#wave-status-count')==='1,200 enemies','Stream width changed wave quota');}

  frame.contentDocument!.querySelector<HTMLButtonElement>('[data-action="start-wave"]')!.click();
  await until(()=>text('#phase')==='COMBAT',1000);
  assert(text('#wave-status-count').includes('remaining'),'Remaining count missing');
  const start=performance.now();let previousRemaining=1200;
  while(text('#phase')==='COMBAT'||text('#phase')==='SETTLING'){
   const diagnostics=JSON.parse(text('.diagnostics pre'));const progress=diagnostics.waveProgress;
   assert(progress.queued+progress.live<=previousRemaining+5,'Progress grew unexpectedly');previousRemaining=progress.queued+progress.live;
   status.textContent=`Running: ${diagnostics.simulationSeconds.toFixed(1)} simulated seconds; ${previousRemaining} remaining (${progress.queued} queued).`;
   assert(diagnostics.invalid===0&&!diagnostics.readbackErrors.length,'Simulation reported an error');
   if(performance.now()-start>150000)throw Error('Opening wave exceeded 150 wall-clock seconds');await sleep(500);
  }
  assert(text('#phase')==='PREPARATION','Defense failed: '+text('#phase')+' '+text('.diagnostics pre'));
  const diagnostics=JSON.parse(text('.diagnostics pre'));
  assert(diagnostics.waveProgress.queued===0&&diagnostics.live===0,'Wave cleared with enemies remaining');
  assert(diagnostics.simulationSeconds<=120,'Opening wave exceeded two simulated minutes');
  assert(text('#wave-status-title').includes('2'),'Next-wave forecast did not advance');
  status.textContent=`PASS: wave 1 cleared in ${diagnostics.simulationSeconds.toFixed(1)} simulated seconds; ${diagnostics.kills} kills; ${text('#base')} integrity. Remaining counter reached zero and wave 2 is ready.`;
 }catch(error){status.textContent='FAIL: '+String(error);}
 finally{await navigate('about:blank');if(backed)restoreSaves(localStorage);button.disabled=false;}
};
try{restoreSaves(localStorage);}catch(error){status.textContent=String(error);button.disabled=true;}

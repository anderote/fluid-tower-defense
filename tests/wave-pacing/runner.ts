import {campaignMap} from '../../src/content/levels.ts';
import {createRun,waveFor} from '../../src/game/index.ts';
import {AUTOSAVE_KEY,CHECKPOINT_KEY} from '../../src/persistence/defense.ts';
import {backupSaves,restoreSaves} from '../e2e/storage.ts';
const button=document.querySelector<HTMLButtonElement>('#run')!,status=document.querySelector('#status')!,frame=document.querySelector<HTMLIFrameElement>('#game')!;
const replay=document.querySelector<HTMLButtonElement>('#replay')!,heavyKey='pressure-front-e2e.heavy-checkpoint.v1';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
function point(x:number,y:number){
 const canvas=frame.contentDocument!.querySelector<HTMLCanvasElement>('canvas')!,r=canvas.getBoundingClientRect(),aspect=r.width/r.height;
 const sx=Math.min(1,1.6/aspect),sy=Math.min(1,aspect/1.6);
 const clientX=r.left+r.width*((x/160*2-1)*sx+1)/2,clientY=r.top+r.height*((y/100*2-1)*sy+1)/2;
 for(const type of ['pointermove','pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX,clientY,button:0,buttons:type==='pointerdown'?1:0}));
}
const text=(selector:string)=>frame.contentDocument?.querySelector(selector)?.textContent??'';
async function until(check:()=>boolean,timeout:number){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error('Timed out: '+text('#message')+'; Metal '+text('#metal')+'; '+text('.diagnostics pre'));await sleep(100);}}
async function navigate(path:string){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Frame load timed out')),12000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.src=path;});}
async function execute(firstWave:number){
 button.disabled=replay.disabled=true;let backed=false;
 try{
  backupSaves(localStorage);backed=true;
  for(const key of Object.keys(localStorage))if(key.startsWith('pressure-front.'))localStorage.removeItem(key);
  if(firstWave===1){
  const map=campaignMap(1),walls=[40,44,48,52].map(y=>({x:48,y,width:4,height:4}));
  map.obstacles.push(...walls);
  const run=createRun(map);run.setBuildMounts(walls);assert(run.spendMetal(walls.length*60).ok,'Wall budget failed');
  for(const [kind,x,y] of [['tesla',42,42],['tesla',42,58],['mortar',64,46],['incinerator',64,58],['repulsor',50,50],['repulsor',54,58],['autocannon',104,26],['autocannon',104,78]] as const)assert(run.place(kind,{x,y}).ok,'Invalid test defense '+kind+' '+x+','+y);
  localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({runState:run.save(),map,spawnBaseline:map.spawn,builtWalls:walls,builtWires:[],difficulty:1,streamWidth:60}));
  }else{
   const checkpoint=localStorage.getItem(heavyKey);assert(checkpoint,'No earned checkpoint to replay');localStorage.setItem(AUTOSAVE_KEY,checkpoint!);
  }
  await navigate('/');await until(()=>text('#adapter').includes('/ WEBGPU'),12000);
  if(firstWave===1){
  assert(text('#wave-status-count')==='1,200 enemies','Opening forecast is wrong');
  const width=frame.contentDocument!.querySelector<HTMLInputElement>('[aria-label="Zombie stream width"]')!;
  for(const value of [1,100,60]){width.value=String(value);width.dispatchEvent(new Event('input',{bubbles:true}));assert(text('#wave-status-count')==='1,200 enemies','Stream width changed wave quota');}

  }
  const results:string[]=[];
  for(let wave=firstWave;wave<=5;wave++){
   if(wave===4&&firstWave===1){
    frame.contentDocument!.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    localStorage.setItem(heavyKey,localStorage.getItem(CHECKPOINT_KEY)!);
   }
   if(wave>1){
    frame.contentDocument!.querySelector<HTMLButtonElement>('#research-tab')!.click();
    for(const id of ['damage','rate']){
     const upgrade=frame.contentDocument!.querySelector<HTMLButtonElement>(`[data-stat="${id}"]`)!;
     assert(!upgrade.disabled,'Earned Metal cannot fund '+id);upgrade.click();
    }
   }
   if(wave===4){
    const forge=frame.contentDocument!.querySelector<HTMLButtonElement>('[data-command="ammunition-forge"]')!;
    assert(!forge.disabled,'Wave 3 earnings cannot fund the forge');forge.click();
   }
   if(wave===3){
    frame.contentDocument!.querySelector<HTMLButtonElement>('#build-tab')!.click();
    const cannon=frame.contentDocument!.querySelector<HTMLButtonElement>('[data-tower="autocannon"]')!;
    assert(!cannon.disabled,'Earned Metal cannot fund rear coverage');cannon.click();
    for(const y of [44,56]){
     const beforeMetal=Number(text('#metal').replaceAll(',',''));
     point(128,y);
     await until(()=>Number(text('#metal').replaceAll(',',''))===beforeMetal-80,1000);
    }
   }
   const forecast=waveFor(1,wave);
   assert(text('#wave-status-detail').includes('Clear reward: '+forecast.payment+' Metal'),'Reward forecast missing');
   const before=JSON.parse(text('.diagnostics pre')),startTime=before.simulationSeconds,startKills=before.kills;
   frame.contentDocument!.querySelector<HTMLButtonElement>('[data-action="start-wave"]')!.click();
   await until(()=>text('#phase')==='COMBAT',1000);
   assert(text('#wave-status-count').includes('remaining'),'Remaining count missing');
   const start=performance.now();let previousRemaining=forecast.total,firstKill:number|undefined,queueDrained:number|undefined,lastProgress=0,longestStall=0;
   while(text('#phase')==='COMBAT'||text('#phase')==='SETTLING'){
    const diagnostics=JSON.parse(text('.diagnostics pre')),progress=diagnostics.waveProgress,elapsed=diagnostics.simulationSeconds-startTime;
    assert(progress.queued+progress.live<=previousRemaining+5,'Progress grew unexpectedly');
    if(progress.queued+progress.live<previousRemaining)lastProgress=elapsed;
    if(firstKill!==undefined)longestStall=Math.max(longestStall,elapsed-lastProgress);
    previousRemaining=progress.queued+progress.live;
    if(firstKill===undefined&&diagnostics.kills>startKills)firstKill=elapsed;
    if(queueDrained===undefined&&progress.queued===0)queueDrained=elapsed;
    status.textContent=results.join('\n')+`\nRunning wave ${wave}: ${elapsed.toFixed(1)}s; ${previousRemaining} remaining (${progress.queued} queued); integrity ${text('#base')}.`;
    assert(diagnostics.invalid===0&&!diagnostics.readbackErrors.length,'Simulation reported an error');
    if(performance.now()-start>300000)throw Error(`Wave ${wave} exceeded 300 wall-clock seconds: `+text('.diagnostics pre'));await sleep(500);
   }
   assert(text('#phase')==='PREPARATION','Defense failed: '+text('#phase')+' '+text('.diagnostics pre'));
   const diagnostics=JSON.parse(text('.diagnostics pre')),elapsed=diagnostics.simulationSeconds-startTime;
   assert(diagnostics.waveProgress.queued===0&&diagnostics.live===0,'Wave cleared with enemies remaining');
   results.push(`Wave ${wave}: ${elapsed.toFixed(1)}s; first kill ${firstKill?.toFixed(1)}s; arrivals finished ${queueDrained?.toFixed(1)}s; ${diagnostics.kills-startKills} kills; integrity ${text('#base')}; Metal ${text('#metal')}; longest lull ${longestStall.toFixed(1)}s.`);
   assert(firstKill!==undefined&&firstKill<=25,'Combat took too long to engage');
   assert(queueDrained!==undefined&&queueDrained<=75,'Arrivals lasted too long');
   assert(longestStall<=20,'Combat stalled for more than 20 seconds');
   assert(elapsed<=135,`Wave ${wave} exceeded 135 simulated seconds: `+results.join('\n'));
   assert(text('#wave-status-title').includes(String(wave+1)),'Next-wave forecast did not advance');
   if(wave===3){
    const boon=frame.contentDocument!.querySelector<HTMLButtonElement>('[data-bonus]');
    assert(boon&&boon.checkVisibility(),'Wave 3 boon is not visible');
    assert(frame.contentDocument!.querySelector<HTMLButtonElement>('[data-action="start-wave"]')!.disabled,'Boon must be selected before continuing');
    boon!.click();
    assert(!frame.contentDocument!.querySelector<HTMLButtonElement>('[data-action="start-wave"]')!.disabled,'Wave 4 not ready after boon');
   }
  }
  status.textContent=`PASS: waves ${firstWave}–5 with earned upgrades${firstWave===1?' and wave 3 boon':' from the saved wave 3 checkpoint'}.\n`+results.join('\n');
 }catch(error){status.textContent+='\nFAIL: '+String(error);}
 finally{await navigate('about:blank');if(backed)restoreSaves(localStorage);button.disabled=false;replay.disabled=!localStorage.getItem(heavyKey);}
}
button.onclick=()=>execute(1);
replay.onclick=()=>execute(4);
replay.disabled=!localStorage.getItem(heavyKey);
try{restoreSaves(localStorage);}catch(error){status.textContent=String(error);button.disabled=true;}

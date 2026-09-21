import {damMap} from '../../src/content/dam.ts';
import {createRun} from '../../src/game/index.ts';
import {terrainMounts} from '../../src/game/terrain.ts';
import {backupSaves,restoreSaves} from '../e2e/storage.ts';
const frame=document.querySelector<HTMLIFrameElement>('#game')!,status=document.querySelector('#status')!,button=document.querySelector<HTMLButtonElement>('#run')!;
const key='pressure-front.dam.autosave.v1',checkpoint='pressure-front.dam.checkpoint.v1';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const text=(s:string)=>frame.contentDocument?.querySelector(s)?.textContent??'';
const el=(s:string)=>frame.contentDocument!.querySelector<HTMLButtonElement>(s)!;
const click=(s:string)=>{assert(el(s)&&!el(s).disabled,'Disabled '+s);el(s).click();};
const diagnostic=()=>JSON.parse(text('.diagnostics pre'));
async function until(check:()=>boolean,timeout=15000){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error('Timed out: '+text('#message')+' '+text('.diagnostics pre'));await sleep(100);}}
async function navigate(path:string){await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Navigation timeout')),15000);frame.onload=()=>{clearTimeout(timeout);resolve();};frame.src=path;});}
button.onclick=async()=>{
 button.disabled=true;let backed=false;
 try{
  backupSaves(localStorage);backed=true;for(const k of Object.keys(localStorage))if(k.startsWith('pressure-front.'))localStorage.removeItem(k);
  localStorage.setItem('pressure-front.autosave.v1','campaign-sentinel');
  const map=damMap(),run=createRun(map);run.setBuildMounts(terrainMounts(map));
  for(const [kind,x,y] of [['tesla',54,38],['tesla',54,64],['incinerator',74,38],['mortar',78,64],['cryo',42,64],['autocannon',98,38],['autocannon',98,64]] as const)assert(run.place(kind,{x,y}).ok,'Invalid budgeted defense '+kind);
  assert(run.model.metal===290,'Defense exceeded budget');
  localStorage.setItem(key,JSON.stringify({runState:run.serialize(),map,spawnBaseline:map.spawn,builtWalls:[],builtWires:[],difficulty:1,streamWidth:60}));
  await navigate('/');await until(()=>text('#adapter').includes('/ WEBGPU'));
  const picker=frame.contentDocument!.querySelector<HTMLSelectElement>('#battlefield-select')!;assert(picker,'Missing visible Battlefield selector');picker.value='dam';picker.dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>text('#adapter').includes('/ WEBGPU')&&text('#metal')==='290'&&!el('#dam-controls').hidden);
  const campaignSave=localStorage.getItem('pressure-front.autosave.v1');
  localStorage.setItem('pressure-front.run.v1','legacy-campaign-sentinel');
  assert(!el('#dam-controls').hidden,'Missing dam controls');assert(el('[data-action="dam-flood"]').disabled,'Flood available in preparation');
  click('[data-action="dam-north"]');await until(()=>el('[data-action="dam-north"]').getAttribute('aria-pressed')==='true');
  click('[data-action="dam-south"]');await until(()=>el('[data-action="dam-south"]').getAttribute('aria-pressed')==='true');
  click('[data-action="save"]');assert(localStorage.getItem(checkpoint),'No separate dam checkpoint');
  await until(()=>JSON.parse(localStorage.getItem(key)!).map.dam.closed.every(Boolean));
  await navigate('/?map=dam');await until(()=>text('#adapter').includes('/ WEBGPU')&&text('#metal')==='290');
  assert(el('[data-action="dam-north"]').getAttribute('aria-pressed')==='true','Gate state lost on reload');
  click('[data-action="start-wave"]');await until(()=>text('#phase')==='COMBAT');
  let released=0,switched=false,paused=false,firstKill=0;const start=performance.now();
  while(['COMBAT','SETTLING'].includes(text('#phase'))){
   const d=diagnostic();assert(d.invalid===0&&!d.readbackErrors.length,'GPU error');
   if(d.kills&&!firstKill)firstKill=d.simulationSeconds;
   if(d.simulationSeconds>10&&!switched){click('[data-action="dam-north"]');switched=true;}
   if(d.simulationSeconds>18&&el('[data-action="dam-north"]').getAttribute('aria-pressed')==='false'&&!el('[data-action="dam-north"]').disabled)click('[data-action="dam-north"]');
   if(d.simulationSeconds>28+released*34&&released<2&&!el('[data-action="dam-flood"]').disabled){
    frame.contentDocument!.body.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true}));released++;
    await until(()=>diagnostic().dam.surge>0);
    if(!paused){click('[data-action="pause"]');await sleep(200);const frozen=JSON.stringify(diagnostic().dam);await sleep(800);assert(JSON.stringify(diagnostic().dam)===frozen,'Paused flood kept advancing');assert(el('[data-action="dam-flood"]').disabled,'Paused flood button enabled');click('[data-action="pause"]');paused=true;}
   }
   status.textContent=`Wave 1: ${d.simulationSeconds.toFixed(1)}s · ${d.kills} kills · ${d.waveProgress.queued+d.live} remaining · ${text('#base')} integrity · ${released} flood releases`;
   assert(performance.now()-start<240000,'Wave timeout');await sleep(300);
  }
  const d=diagnostic();assert(text('#phase')==='PREPARATION','Defense lost');assert(firstKill>0&&firstKill<25,'Opening engagement too slow');assert(d.simulationSeconds<150,'Wave dragged on');assert(released>=1,'No flood exercised');assert(d.live===0&&d.waveProgress.queued===0,'Stranded enemies');
  assert(localStorage.getItem('pressure-front.run.v1')==='legacy-campaign-sentinel','Dam overwrote legacy campaign save');
  assert(localStorage.getItem('pressure-front.autosave.v1')===campaignSave,'Dam overwrote campaign save');
  status.textContent=`PASS: wave 1 cleared in ${d.simulationSeconds.toFixed(1)}s; ${d.kills} kills; ${text('#base')} integrity; first kill ${firstKill.toFixed(1)}s; ${released} floods. Gate diversion, reload, pause, recharge, save isolation, and GPU health passed.`;
 }catch(error){status.textContent='FAIL: '+String(error);console.error(error);}
 finally{await navigate('about:blank');if(backed)restoreSaves(localStorage);button.disabled=false;}
};
try{restoreSaves(localStorage);}catch(error){status.textContent='Save recovery required: '+String(error);button.disabled=true;}

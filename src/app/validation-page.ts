import {connectGPU} from '../runtime/gpu.ts';
import {verifyABI} from '../runtime/abi-check.ts';
import {runGPUValidation} from '../validation/index.ts';
export async function showValidation(root:HTMLElement){
 root.innerHTML='<main style="padding:32px;max-width:1000px"><h1>Pressure Front — GPU validation</h1><p id="validation-status">Running on the local GPU…</p><canvas width="64" height="64" hidden></canvas><pre id="validation-output" style="white-space:pre-wrap"></pre><a href="/">Return to game</a></main>';
 try{
  const gpu=await connectGPU(root.querySelector('canvas')!);
  const errors:string[]=[];gpu.device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
  const abi=await verifyABI(gpu.device);const results=await runGPUValidation(gpu.device);
  root.querySelector('#validation-status')!.textContent=`${results.filter(r=>r.passed).length}/${results.length} checks passed · ABI ${abi?'passed':'FAILED'} · ${gpu.adapter} · GPU errors ${errors.length}`;
  root.querySelector('#validation-output')!.textContent=JSON.stringify({abi,results,errors},null,2);
  gpu.shared.particles.destroy();gpu.shared.counters.destroy();gpu.device.destroy();
 }catch(error){root.querySelector('#validation-status')!.textContent=String(error);}
}

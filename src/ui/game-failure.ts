/** A failed graphics startup must not expose a wall of GPU/compiler diagnostics. */
export function showGameFailure(root:HTMLElement,error:unknown){
 if(root.querySelector('.gpu-notice'))return;
 const message=error instanceof Error?error.message:String(error);
 const unsupported=/WebGPU is unavailable|No WebGPU adapter|storage buffers per shader stage/.test(message);
 const notice=document.createElement('section');notice.className='gpu-notice';notice.setAttribute('role','alert');
 const title=document.createElement('h1');title.textContent=unsupported?'This browser can’t run the game yet':'The game couldn’t start';
 const help=document.createElement('p');help.textContent=unsupported?'Pressure Front needs WebGPU graphics support. Try an updated browser on a compatible device.':'Try reloading the game. Your saved progress is kept on this device.';
 const retry=document.createElement('button');retry.textContent='Reload game';retry.onclick=()=>location.reload();
 const details=document.createElement('details'),summary=document.createElement('summary'),technical=document.createElement('pre');summary.textContent='Technical details';technical.textContent=message;details.append(summary,technical);
 notice.append(title,help,retry,details);root.append(notice);
}

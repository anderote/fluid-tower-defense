import {drawSoldatFrame,SOLDAT_KINDS,createSoldatAtlas} from '../../src/render/soldat-art.ts';
import {TOWERS} from '../../src/content/index.ts';
const details=['Braced acoustic transducer','Heavy tube / traverse cradle','Cooling jacket / belt-fed receiver','Twin pressure vessels / cooling fins','Ceramic insulators / copper windings','Three-tube launcher / armored rack','Parallel rails / capacitor banks','Fuel bottles / shrouded flame nozzle'];
const contexts=SOLDAT_KINDS.map((kind,i)=>{
 const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),detail=document.createElement('small');
 canvas.width=canvas.height=64;caption.textContent=TOWERS[kind].name;detail.textContent=details[i];figure.append(canvas,caption,detail);document.querySelector('main')!.append(figure);return canvas.getContext('2d',{willReadFrequently:true})!;
});
let angle=0,animating=false,last=0;
const draw=()=>{contexts.forEach((ctx,i)=>drawSoldatFrame(ctx,SOLDAT_KINDS[i],angle));document.querySelector('#status')!.textContent=`Aim ${Math.round(angle*180/Math.PI)%360}° · Same scale and lighting across all defenses`;};
document.querySelector('#rotate')!.addEventListener('click',()=>{angle+=Math.PI/4;draw();});
document.querySelector('#animate')!.addEventListener('click',event=>{animating=!animating;(event.target as HTMLElement).textContent=animating?'Pause rotation':'Animate rotation';});
function tick(time:number){if(animating&&time-last>80){angle+=Math.PI/32;draw();last=time;}requestAnimationFrame(tick);}draw();requestAnimationFrame(tick);
// Exercise every generated direction, including rarely seen north-facing barrels.
const atlas=createSoldatAtlas(),pixels=atlas.canvas.getContext('2d')!.getImageData(0,0,atlas.canvas.width,atlas.canvas.height).data;
let clipped=0;
for(const f of atlas.frames)for(let i=0;i<64;i++){
 for(const [x,y] of [[f.x+i,f.y],[f.x+i,f.y+63],[f.x,f.y+i],[f.x+63,f.y+i]])if(pixels[(y*atlas.canvas.width+x)*4+3]>160)clipped++;
}
const checks=document.createElement('p');checks.textContent=clipped?`FAIL: ${clipped} clipped border pixels`:`PASS: all ${atlas.frames.length} directional frames fit their canvases`;document.body.append(checks);

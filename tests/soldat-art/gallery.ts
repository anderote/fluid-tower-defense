import {drawSoldatFrame,SOLDAT_KINDS,createSoldatAtlas,SOLDAT_UPGRADE_LEVELS,soldatSpriteKey} from '../../src/render/soldat-art.ts';
import {TOWERS} from '../../src/content/index.ts';
const details=['Braced acoustic transducer','Heavy tube / traverse cradle','Cooling jacket / belt-fed receiver','Twin pressure vessels / cooling fins','Ceramic insulators / copper windings','Three-tube launcher / armored rack','Parallel rails / capacitor banks','Fuel bottles / shrouded flame nozzle'];
const contexts=SOLDAT_KINDS.flatMap((kind,i)=>{
 const row=document.createElement('section'),heading=document.createElement('h2'),description=document.createElement('small'),frames=document.createElement('div');
 heading.textContent=TOWERS[kind].name;description.textContent=details[i];frames.className='frames';row.append(heading,description,frames);document.querySelector('main')!.append(row);
 return SOLDAT_UPGRADE_LEVELS.map(level=>{
  const figure=document.createElement('figure'),canvas=document.createElement('canvas'),actual=document.createElement('canvas'),caption=document.createElement('figcaption');
  canvas.width=canvas.height=actual.width=actual.height=64;actual.className='actual';caption.textContent=level===0?'Base':`Level ${level}`;
  figure.append(canvas,actual,caption);frames.append(figure);
  return {kind,level,ctx:canvas.getContext('2d',{willReadFrequently:true})!,actual:actual.getContext('2d')!};
 });
});
let angle=0,animating=false,last=0;
const draw=()=>{contexts.forEach(({ctx,actual,kind,level})=>{drawSoldatFrame(ctx,kind,angle,level);actual.clearRect(0,0,64,64);actual.drawImage(ctx.canvas,0,0);});document.querySelector('#status')!.textContent=`Aim ${Math.round(angle*180/Math.PI)%360}° · Same scale and lighting across all defenses`;};
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

// Exercise level routing as used by the renderer and verify every tier changes.
const failures:string[]=[];
for(const kind of SOLDAT_KINDS)for(let tier=0;tier<SOLDAT_UPGRADE_LEVELS.length;tier++){
 const level=SOLDAT_UPGRADE_LEVELS[tier],ids=atlas.sprites[soldatSpriteKey(kind,level)];
 if(ids.length!==64)failures.push(`${kind} level ${level}: missing directions`);
 if(tier===0)continue;
 for(let facing=0;facing<64;facing++){
  const a=atlas.frames[ids[facing]],b=atlas.frames[atlas.sprites[soldatSpriteKey(kind,SOLDAT_UPGRADE_LEVELS[tier-1])][facing]];
  let changed=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const aa=((a.y+y)*atlas.canvas.width+a.x+x)*4,bb=((b.y+y)*atlas.canvas.width+b.x+x)*4;
   if(pixels[aa]!==pixels[bb]||pixels[aa+1]!==pixels[bb+1]||pixels[aa+2]!==pixels[bb+2]||pixels[aa+3]!==pixels[bb+3])changed++;
  }
  if(changed<4)failures.push(`${kind} level ${level}, facing ${facing}: upgrade is invisible`);
 }
}
const tierChecks=document.createElement('p');tierChecks.textContent=failures.length?`FAIL: ${failures.join('; ')}`:'PASS: every upgrade tier visibly changes in all 64 directions';document.body.append(tierChecks);

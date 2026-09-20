import type {TowerKind} from '../contracts/index.ts';

/** Original weapon studies inspired by Soldat's compact, worn military sprites.
 * Geometry is baked from 64 views under fixed lighting; no Soldat art is copied.
 */
export const SOLDAT_FACINGS=64;
export const SOLDAT_FRAME=64;
// Padding includes north-facing barrels and the Tesla's elevated cap.
export const SOLDAT_WORLD_SIZE=6;
export const SOLDAT_KINDS:TowerKind[]=['repulsor','mortar','autocannon','cryo','tesla','rocket','railgun','incinerator'];
export const soldatFacing=(angle:number)=>((Math.round(angle*SOLDAT_FACINGS/(Math.PI*2))%SOLDAT_FACINGS)+SOLDAT_FACINGS)%SOLDAT_FACINGS;
type Point=[number,number,number];
type Color=[number,number,number];
type Face={points:Point[];color:Color;shade:number};
const metal:Color=[137,151,155],dark:Color=[48,54,57],edge:Color=[209,215,197],rubber:Color=[32,35,34],copper:Color=[188,129,68],ceramic:Color=[204,216,213];
// Painted housings carry identity at normal zoom; exposed steel stays neutral.
const PAINT:Record<TowerKind,{body:Color;trim:Color}>={
  repulsor:{body:[42,153,145],trim:[135,236,216]},
  mortar:{body:[188,143,57],trim:[245,210,128]},
  autocannon:{body:[94,143,66],trim:[196,219,113]},
  cryo:{body:[98,182,215],trim:[213,247,253]},
  tesla:{body:[138,91,180],trim:[217,179,250]},
  rocket:{body:[181,66,64],trim:[245,159,130]},
  railgun:{body:[64,109,189],trim:[134,200,252]},
  incinerator:{body:[208,105,39],trim:[255,204,94]},
};
export const SOLDAT_UPGRADE_LEVELS=[0,1,10,25,50] as const;
export const soldatUpgradeStage=(level=0):number=>{
  let stage=0;
  for(let i=1;i<SOLDAT_UPGRADE_LEVELS.length;i++)if(level>=SOLDAT_UPGRADE_LEVELS[i])stage=i;
  return stage;
};
export const soldatSpriteKey=(kind:TowerKind,level=0)=>`${kind}:${soldatUpgradeStage(level)}`;

function model(kind:TowerKind,angle:number,level:number):Face[]{
  const faces:Face[]=[],{body:paint,trim}=PAINT[kind],stage=soldatUpgradeStage(level);
  const rotate=(x:number,y:number,z:number,moving:boolean):Point=>moving?[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),z]:[x,y,z];
  function solid(outline:[number,number][],bottom:number,top:number,color:Color,moving=true){
    const points=outline.map(([x,y])=>rotate(x,y,top,moving));faces.push({points,color,shade:1});
    for(let i=0;i<outline.length;i++){
      const next=(i+1)%outline.length,[x,y]=outline[i],[xx,yy]=outline[next];
      const a=rotate(x,y,bottom,moving),b=rotate(xx,yy,bottom,moving),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const nx=dy/length,ny=-dx/length;
      if(ny<-.001)continue;
      faces.push({points:[a,b,points[next],points[i]],color,shade:.42+Math.max(0,-nx*.5-ny*.65)*.32});
    }
  }
  function box(x:number,y:number,w:number,h:number,z:number,height:number,color:Color,moving=true){
    solid([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],z,z+height,color,moving);
  }
  function disc(x:number,y:number,r:number,z:number,height:number,color:Color,moving=true,n=12){
    solid(Array.from({length:n},(_,i)=>[x+Math.cos(i*2*Math.PI/n)*r,y+Math.sin(i*2*Math.PI/n)*r]),z,z+height,color,moving);
  }
  function barrel(length:number,width:number,y=0,z=.65){
    box(.2,y-width/2,length-.2,width,z,.16,dark);
    box(.28,y-width/2+.025,length-.34,width*.28,z+.16,.015,metal);
    box(length-.2,y-width*.7,.21,width*1.4,z-.035,.23,rubber);
    box(length-.19,y-width*.6,.13,width*.22,z+.2,.01,edge);
  }
  // Fixed bolted feet and bearing remain stationary while the weapon turns.
  for(const [x,y] of [[-.93,-.85],[.66,-.85],[-.93,.61],[.66,.61]]){
    box(x,y,.28,.27,0,.15,dark,false);disc(x+.14,y+.13,.055,.15,.035,edge,false,6);
  }
  disc(0,0,.83,.05,.22,dark,false);disc(0,0,.66,.27,.1,metal,false);
  if(kind==='autocannon'){
    // Exposed receiver, cooling jacket, ammunition box and short feed belt.
    barrel(2,.18,0,.68);box(-.72,-.29,1.12,.58,.38,.35,paint);
    box(-.57,-.2,.59,.37,.73,.07,trim);box(-.88,.38,.65,.48,.2,.45,paint);
    for(let i=0;i<5;i++)box(-.46+i*.09,.23,.06,.22,.62,.045,copper);
    for(let i=0;i<4;i++)box(.45+i*.22,-.12,.07,.24,.78,.05,rubber);
    box(-.67,-.32,.11,.65,.74,.06,edge);box(.12,-.07,.12,.14,.82,.15,rubber);
  }else if(kind==='mortar'){
    // Heavy short tube supported by a broad traverse cradle.
    disc(0,0,1.05,.05,.12,paint,false);box(-.58,-.57,.85,1.14,.28,.42,dark);
    barrel(1.7,.58,0,.75);box(-.66,-.41,.63,.82,.55,.37,paint);
    box(.05,-.68,.18,1.36,.32,.18,metal);disc(.13,.7,.17,.45,.08,edge);
  }else if(kind==='rocket'){
    box(-.95,-.8,1.66,1.6,.37,.48,paint);
    for(const y of [-.52,0,.52]){barrel(1.95,.35,y,.86);box(-.83,y-.17,1.12,.34,.85,.18,dark);box(-.74,y-.13,.17,.26,1.03,.02,copper);}
    box(-.94,-.84,.16,1.68,.86,.15,metal);
  }else if(kind==='tesla'){
    box(-.76,-.66,1.52,1.32,.14,.32,paint,false);
    disc(0,0,.18,.4,1.65,copper,false);
    for(let i=0;i<5;i++)disc(0,0,.44-i*.045,.65+i*.25,.1,i%2?ceramic:trim,false);
    disc(0,0,.27,1.99,.2,metal,false);disc(-.06,-.06,.11,2.19,.04,edge,false);
    box(-.66,-.48,.25,.75,.46,.13,rubber,false);box(.46,-.48,.17,.34,.46,.13,copper,false);
  }else if(kind==='incinerator'){
    for(const y of [-.5,.5]){disc(-.65,y,.28,.24,.7,paint);disc(-.65,y,.13,.94,.08,trim);}
    box(-.45,-.3,.9,.6,.4,.32,paint);barrel(2.15,.32,0,.69);
    for(let i=0;i<4;i++)box(.58+i*.26,-.2,.08,.4,.8,.05,copper);
    box(-.6,-.77,.18,1.54,.52,.09,metal);
  }else if(kind==='cryo'){
    for(const y of [-.51,.51]){box(-.86,y-.22,1,.44,.25,.48,paint);box(-.67,y-.23,.13,.46,.74,.05,ceramic);}
    barrel(2,.39,0,.64);box(-.3,-.32,.78,.64,.37,.38,paint);
    for(let i=0;i<4;i++)box(.68+i*.22,-.28,.07,.56,.68,.2,metal);
    box(-.09,-.14,.19,.28,.76,.02,trim);
  }else if(kind==='railgun'){
    box(-1,-.4,1.2,.8,.36,.3,paint);barrel(2.15,.17,0,.72);
    for(const y of [-.3,.19])box(.1,y,1.82,.11,.71,.17,trim);
    for(let i=0;i<4;i++)box(.32+i*.36,-.3,.14,.6,.59,.11,copper);
    box(-.7,-.23,.48,.46,.66,.08,rubber);box(-.63,-.2,.1,.4,.75,.02,edge);
  }else{
    // Repulsor: a braced directional transducer, with a visibly open mouth.
    box(-.7,-.39,.9,.78,.36,.35,paint);barrel(1.45,.43,0,.62);
    box(.92,-.74,.35,1.48,.48,.49,metal);box(1.28,-.59,.13,1.18,.53,.32,rubber);
    for(const y of [-.65,.51])box(.7,y,.8,.14,.83,.09,trim);
    box(-.6,-.16,.24,.32,.72,.03,trim);
  }
  // Small type-specific fittings strengthen silhouettes without moving a muzzle.
  if(kind==='repulsor')for(const y of [-.48,.35])box(-.63,y,.58,.13,.71,.12,trim);
  if(kind==='mortar')box(-.62,-.4,.19,.8,.93,.025,trim);
  if(kind==='autocannon')box(-.85,.43,.58,.1,.66,.025,trim);
  if(kind==='rocket')for(const y of [-.75,.64])box(-.7,y,1.17,.11,.86,.08,trim);
  if(kind==='incinerator')for(const y of [-.5,.5])box(-.87,y-.08,.45,.16,.96,.04,rubber);
  if(kind==='railgun')for(const y of [-.56,.42])box(-.88,y,.68,.14,.39,.32,paint);

  // Rank bars appear with the first upgrade. Foundations never rotate or grow.
  // Later tiers add functional hardware, not longer barrels or extra muzzles.
  if(stage>0){
    box(-.62,.72,1.24,.22,.18,.1,paint,false);
    for(let i=0;i<stage;i++)box(-.51+i*.28,.75,.14,.16,.28,.025,trim,false);
  }
  if(stage>=2){
    if(kind==='autocannon'){
      box(-.87,-.65,.68,.27,.32,.36,paint);box(-.78,-.63,.16,.23,.69,.025,trim);
    }else if(kind==='mortar'){
      for(const y of [-.87,.69])box(-.45,y,.94,.18,.18,.25,paint);
    }else if(kind==='rocket'){
      for(const y of [-.95,.8])box(-.9,y,1.4,.15,.42,.46,paint);
    }else if(kind==='tesla'){
      for(const x of [-.59,.59]){disc(x,0,.17,.46,.39,paint,false);disc(x,0,.12,.85,.06,trim,false);}
    }else if(kind==='cryo'){
      for(const y of [-.51,.51])box(-.38,y-.24,.18,.48,.74,.1,trim);
    }else if(kind==='incinerator'){
      for(const y of [-.5,.5])disc(-.65,y,.29,.69,.13,trim);
    }else if(kind==='railgun'){
      for(const y of [-.68,.48])box(-.91,y,.73,.2,.4,.36,paint);
    }else{
      for(const y of [-.63,.43])box(-.63,y,.74,.2,.35,.4,paint);
    }
  }
  if(stage>=3){
    if(kind==='tesla'){
      for(const x of [-.56,.56]){disc(x,-.3,.085,.48,.8,copper,false);disc(x,-.3,.15,1.28,.1,trim,false);}
    }else if(kind==='mortar'){
      box(-.38,-.38,.25,.76,.94,.12,metal);box(-.32,-.3,.1,.6,1.06,.025,trim);
    }else if(kind==='rocket'){
      box(-.62,-.29,.42,.58,1.06,.15,paint);box(-.54,-.21,.12,.42,1.21,.02,trim);
    }else{
      for(const y of [-.34,.24])for(let i=0;i<3;i++)box(.35+i*.22,y,.12,.1,.86,.16,trim);
    }
  }
  if(stage>=4){
    // A compact, bright rear instrument plate distinguishes fully upgraded guns.
    const z=kind==='tesla'?.48:kind==='rocket'?1.06:1.03;
    box(-.84,-.26,.28,.52,z,.12,paint,kind!=='tesla');
    box(-.8,-.2,.2,.4,z+.12,.035,trim,kind!=='tesla');
    box(-.75,-.04,.1,.08,z+.155,.025,rubber,kind!=='tesla');
  }
  return faces.sort((a,b)=>a.points.reduce((n,p)=>n+p[1]+p[2]*.65,0)/a.points.length-b.points.reduce((n,p)=>n+p[1]+p[2]*.65,0)/b.points.length);
}

export function drawSoldatFrame(ctx:CanvasRenderingContext2D,kind:TowerKind,angle:number,level=0){
  const scale=SOLDAT_FRAME/SOLDAT_WORLD_SIZE,origin=32;
  ctx.clearRect(0,0,64,64);ctx.fillStyle='rgba(9,12,8,.48)';ctx.beginPath();ctx.ellipse(34,37,15,11,0,0,Math.PI*2);ctx.fill();
  for(const face of model(kind,angle,level)){
    ctx.beginPath();face.points.forEach(([x,y,z],i)=>{const xx=origin+x*scale,yy=origin+(y-z*.65)*scale;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});ctx.closePath();
    ctx.fillStyle=`rgb(${face.color.map(v=>Math.round(v*face.shade)).join(',')})`;ctx.fill();ctx.lineWidth=.6;ctx.strokeStyle='rgba(15,19,15,.65)';ctx.stroke();
  }
  // Fine material grain, not a colored outline or a glow. Same seed for all views.
  const image=ctx.getImageData(0,0,64,64);
  for(let i=0;i<64*64;i++)if(image.data[i*4+3]>220){const noise=((Math.imul(i+11,2654435761)>>>24)%9)-4;for(let c=0;c<3;c++)image.data[i*4+c]+=noise;}
  ctx.putImageData(image,0,0);
}

export function createSoldatAtlas(){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.ceil(SOLDAT_KINDS.length*SOLDAT_FACINGS*SOLDAT_UPGRADE_LEVELS.length/32)*SOLDAT_FRAME;
  const ctx=canvas.getContext('2d')!,tile=document.createElement('canvas');tile.width=tile.height=64;
  const painter=tile.getContext('2d',{willReadFrequently:true})!;
  const frames:{x:number;y:number;width:number;height:number}[]=[],sprites:Record<string,number[]>={};
  for(const kind of SOLDAT_KINDS)for(const level of SOLDAT_UPGRADE_LEVELS){
    const key=soldatSpriteKey(kind,level);sprites[key]=[];
    for(let facing=0;facing<SOLDAT_FACINGS;facing++){
      drawSoldatFrame(painter,kind,facing*Math.PI*2/SOLDAT_FACINGS,level);
      const id=frames.length,x=(id%32)*64,y=Math.floor(id/32)*64;
      ctx.drawImage(tile,x,y);frames.push({x,y,width:64,height:64});sprites[key].push(id);
    }
  }
  return {canvas,frames,sprites};
}

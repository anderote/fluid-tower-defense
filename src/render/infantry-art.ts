import {INFANTRY_FRAME,INFANTRY_FRAMES,INFANTRY_FACINGS,INFANTRY_PIVOT,INFANTRY_KINDS,INFANTRY_ATTACK,INFANTRY_DEATH,classicInfantryFacing,classicDogFrame,attackFrames} from './infantry-animation.ts';
type Point=[number,number,number];
type Atlas={frames:{x:number;y:number;width:number;height:number}[];sprites:Record<string,number[]>};
const assetBase=(import.meta as ImportMeta&{env?:{BASE_URL?:string}}).env?.BASE_URL??'/';

/** Original samurai sprite, using the same small projected body and eight facings. */
export function drawSamuraiFrame(ctx:CanvasRenderingContext2D,facing:number,frame:number){
  ctx.clearRect(0,0,INFANTRY_FRAME,INFANTRY_FRAME);
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(INFANTRY_PIVOT.x-4,INFANTRY_PIVOT.y-1,9,3);
  const angle=facing*Math.PI/4,f=[Math.cos(angle),Math.sin(angle)],side=[-f[1],f[0]];
  const walking=frame>0&&frame<INFANTRY_ATTACK,phase=(frame-1)*Math.PI/3;
  const stride=walking?Math.sin(phase):0,fall=frame>=INFANTRY_DEATH?(frame-INFANTRY_DEATH)/7:0;
  const attack=frame>=INFANTRY_ATTACK&&frame<INFANTRY_DEATH;
  const swing=attack?Math.min(1,(frame-INFANTRY_ATTACK)/7):0;
  const ink='#22291f',cloth='#687049',light='#9c9a61',armor='#474e44',skin='#bd9d71',steel='#c2c5a5';
  const project=([x,y,z]:Point):[number,number]=>{
    const xx=x+z*fall*.75,zz=z*(1-fall*.95);
    return [Math.round(INFANTRY_PIVOT.x+(f[0]*xx+side[0]*y)*8),Math.round(INFANTRY_PIVOT.y+(f[1]*xx+side[1]*y)*5-zz*10)];
  };
  const pixel=(p:Point,w:number,h:number,color:string)=>{const [x,y]=project(p);ctx.fillStyle=color;ctx.fillRect(x-Math.floor(w/2),y-Math.floor(h/2),w,h);};
  // Integer Bresenham strokes keep every sprite crisp at the original pixel scale.
  const stroke=(a:Point,b:Point,width:number,color:string)=>{
    let [x,y]=project(a);const [tx,ty]=project(b),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;let error=dx+dy;
    ctx.fillStyle=color;
    for(;;){ctx.fillRect(x-Math.floor(width/2),y-Math.floor(width/2),width,width);if(x===tx&&y===ty)break;const e=error*2;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}
  };
  const limb=(a:Point,b:Point,width:number,color:string)=>{stroke(a,b,width+2,ink);stroke(a,b,width,color);};
  const leg=(s:number)=>{const step=stride*s*.26;limb([0,s*.16,.65],[step*.4,s*.18,.3],2,cloth);limb([step*.4,s*.18,.3],[step,s*.2,.04+Math.max(0,-stride*s)*.16],2,armor);pixel([step+.08,s*.2,.03],3,2,ink);};
  const far=side[1]>0?-1:1;
  leg(far);leg(-far);
  // Segmented cuirass, waist plates, and shoulder guards keep the melee role readable.
  limb([0,0,.58],[.03,0,1.14],5,armor);
  for(let i=0;i<3;i++)stroke([.06,-.24,.64+i*.16],[.06,.24,.64+i*.16],1,i%2?light:cloth);
  for(const s of [far,-far]){
    const hand:Point=[attack?.3+Math.sin(swing*Math.PI)*.35:.22,s*.18,attack?1.36-swing*.63:.84];
    limb([0,s*.32,1.12],[.1,s*.35,.93],2,cloth);limb([.1,s*.35,.93],hand,2,armor);pixel(hand,2,2,skin);pixel([0,s*.3,1.13],3,2,light);
  }
  pixel([.05,0,1.3],4,4,ink);pixel([.08,0,1.3],3,3,skin);
  pixel([0,0,1.5],7,3,ink);pixel([0,0,1.52],5,2,armor);pixel([0,0,1.61],3,1,light);
  for(const s of [-1,1])stroke([0,s*.27,1.53],[.04,s*.4,1.7],1,light);
  const hand:Point=[attack?.3:.23,0,attack?1.36-swing*.63:.91];
  const sword:Point=[attack?.18+Math.sin(swing*Math.PI)*1.1:.62,attack?-.5+1.1*swing:.1,attack?1.95-swing*1.35:1.52];
  stroke(hand,sword,3,ink);stroke(hand,sword,1,steel);
  pixel(hand,2,2,'#c0a24f');
}

/** Normalize all troops to a common foot pivot; never rotate a flat sprite in screen space. */
export async function createInfantryAtlas(){
  const [metadata,response]=await Promise.all([fetch(`${assetBase}assets/red-alert/infantry/atlas.json`),fetch(`${assetBase}assets/red-alert/infantry/atlas.png`)]);
  if(!metadata.ok||!response.ok)throw Error('Red Alert infantry atlas is missing');
  const atlas:Atlas=await metadata.json(),bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const [dogMetadata,dogResponse]=await Promise.all([fetch(`${assetBase}assets/red-alert/atlas.json`),fetch(`${assetBase}assets/red-alert/atlas.png`)]);
  if(!dogMetadata.ok||!dogResponse.ok){bitmap.close();throw Error('Red Alert dog atlas is missing');}
  const dogAtlas:Atlas=await dogMetadata.json(),dogBitmap=await createImageBitmap(await dogResponse.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const canvas=document.createElement('canvas');canvas.width=INFANTRY_FRAME*INFANTRY_FRAMES;canvas.height=INFANTRY_FRAME*INFANTRY_FACINGS*INFANTRY_KINDS.length;
  const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  const tile=document.createElement('canvas');tile.width=tile.height=INFANTRY_FRAME;const brush=tile.getContext('2d')!;brush.imageSmoothingEnabled=false;
  try{
    for(const [row,kind] of INFANTRY_KINDS.entries())for(let facing=0;facing<8;facing++)for(let frame=0;frame<INFANTRY_FRAMES;frame++){
      const x=frame*INFANTRY_FRAME,y=(row*8+facing)*INFANTRY_FRAME;
      if(kind==='samurai'){drawSamuraiFrame(brush,facing,frame);ctx.drawImage(tile,x,y);continue;}
      if(kind==='dog'){
        const pose=classicDogFrame(facing,frame),f=dogAtlas.frames[dogAtlas.sprites[pose.sprite]?.[pose.frame]];
        if(!f)throw Error(`Missing dog frame ${pose.sprite}/${pose.frame}`);
        ctx.drawImage(dogBitmap,f.x,f.y,f.width,f.height,x+INFANTRY_PIVOT.x-25,y+INFANTRY_PIVOT.y-20,f.width,f.height);continue;
      }
      const direction=classicInfantryFacing(facing),shootLength=attackFrames(kind);
      const source=frame===0?direction:frame<INFANTRY_ATTACK?16+direction*6+frame-1:frame<INFANTRY_DEATH?64+direction*shootLength+Math.min(shootLength-1,frame-INFANTRY_ATTACK):64+shootLength*8+frame-INFANTRY_DEATH;
      const f=atlas.frames[atlas.sprites[kind]?.[source]];
      if(!f)throw Error(`Missing ${kind} infantry frame ${source}`);
      // Native 50×39 Westwood canvas: its foot pivot is (25,20), not its center.
      ctx.drawImage(bitmap,f.x,f.y,f.width,f.height,x+INFANTRY_PIVOT.x-25,y+INFANTRY_PIVOT.y-20,f.width,f.height);
    }
  }finally{bitmap.close();dogBitmap.close();}
  return canvas;
}

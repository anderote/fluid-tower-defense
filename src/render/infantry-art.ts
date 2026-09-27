import {INFANTRY_FRAME,INFANTRY_FRAMES,INFANTRY_FACINGS,INFANTRY_PIVOT,INFANTRY_KINDS,INFANTRY_ATTACK,INFANTRY_DEATH,classicInfantryFacing,classicDogFrame,attackFrames} from './infantry-animation.ts';
type Point=[number,number,number];
type Atlas={frames:{x:number;y:number;width:number;height:number}[];sprites:Record<string,number[]>};
const assetBase=(import.meta as ImportMeta&{env?:{BASE_URL?:string}}).env?.BASE_URL??'/';

/** Original Red Alert-scale samurai: compact silhouette, limited palette, crisp pixels. */
export function drawSamuraiFrame(ctx:CanvasRenderingContext2D,facing:number,frame:number){
  ctx.clearRect(0,0,INFANTRY_FRAME,INFANTRY_FRAME);
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(INFANTRY_PIVOT.x-4,INFANTRY_PIVOT.y-1,8,2);
  const angle=facing*Math.PI/4,f=[Math.cos(angle),Math.sin(angle)],side=[-f[1],f[0]];
  const walking=frame>0&&frame<INFANTRY_ATTACK,phase=(frame-1)*Math.PI/3;
  const stride=walking?Math.sin(phase):0,fall=frame>=INFANTRY_DEATH?(frame-INFANTRY_DEATH)/7:0;
  const attack=frame>=INFANTRY_ATTACK&&frame<INFANTRY_DEATH;
  const progress=attack?Math.min(1,(frame-INFANTRY_ATTACK)/15):0;
  const cut=attack?Math.max(0,Math.min(1,(progress-.22)/.38)):0,follow=attack?Math.max(0,(progress-.6)/.4):0;
  const ease=(v:number)=>v*v*(3-2*v),swing=ease(cut),lunge=attack?Math.sin(Math.min(1,progress/.72)*Math.PI)*.17:0;
  const ink='#182016',cloth='#59643a',dark='#354329',light='#92934e',skin='#b58a5d',steel='#d3d5bd',band='#7d3028';
  const project=([x,y,z]:Point):[number,number]=>{
    const xx=x+z*fall*.75,zz=z*(1-fall*.95);
    return [Math.round(INFANTRY_PIVOT.x+(f[0]*xx+side[0]*y)*7),Math.round(INFANTRY_PIVOT.y+(f[1]*xx+side[1]*y)*4.5-zz*9)];
  };
  const pixel=(p:Point,w:number,h:number,color:string)=>{const [x,y]=project(p);ctx.fillStyle=color;ctx.fillRect(x-Math.floor(w/2),y-Math.floor(h/2),w,h);};
  // Integer Bresenham strokes keep every sprite crisp at the original pixel scale.
  const stroke=(a:Point,b:Point,width:number,color:string)=>{
    let [x,y]=project(a);const [tx,ty]=project(b),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;let error=dx+dy;
    ctx.fillStyle=color;
    for(;;){ctx.fillRect(x-Math.floor(width/2),y-Math.floor(width/2),width,width);if(x===tx&&y===ty)break;const e=error*2;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}
  };
  const limb=(a:Point,b:Point,width:number,color:string)=>{stroke(a,b,width+2,ink);stroke(a,b,width,color);};
  const leg=(s:number)=>{const step=stride*s*.24;limb([lunge,s*.13,.61],[lunge+step*.4,s*.14,.3],1,cloth);limb([lunge+step*.4,s*.14,.3],[lunge+step,s*.16,.04+Math.max(0,-stride*s)*.14],1,dark);pixel([lunge+step+.06,s*.16,.03],3,2,ink);};
  const far=side[1]>0?-1:1;
  leg(far);leg(-far);
  // A narrow flak-jacket silhouette and olive remap values sit beside the classic troops.
  limb([lunge,0,.57],[lunge+.01,0,1.08],4,cloth);
  stroke([lunge+.03,-.18,.7],[lunge+.03,.18,.7],1,dark);stroke([lunge+.03,-.18,.92],[lunge+.03,.18,.92],1,light);
  pixel([lunge,far*.22,1.02],3,2,dark);pixel([lunge,-far*.22,1.02],3,2,cloth);
  let hilt:Point=[lunge+.2,.04,.9],tip:Point=[lunge+.58,-.08,1.46];
  if(attack){
    const start:Point=[lunge-.34,-.58,1.82],end:Point=[lunge+1.02,.58,.56];
    hilt=[lunge+.11+.23*swing,-.2+.36*swing,1.17-.34*swing];
    tip=[start[0]+(end[0]-start[0])*swing,start[1]+(end[1]-start[1])*swing,start[2]+(end[2]-start[2])*swing];
    if(follow>.65){const recovery=(follow-.65)/.35;tip=[tip[0]+(.58-tip[0])*recovery,tip[1]+(-.08-tip[1])*recovery,tip[2]+(1.46-tip[2])*recovery];}
  }
  for(const s of [far,-far]){const hand:Point=[hilt[0]-.08*Math.max(0,s),hilt[1]+s*.07,hilt[2]+s*.035];limb([lunge,s*.2,1.02],[lunge+.07,s*.24,.91],1,cloth);limb([lunge+.07,s*.24,.91],hand,1,dark);pixel(hand,2,2,skin);}
  // Small face and cloth head wrap replace the oversized fantasy helmet.
  pixel([lunge+.03,0,1.25],4,4,ink);pixel([lunge+.08,0,1.25],3,3,skin);
  stroke([lunge+.02,-.2,1.37],[lunge+.02,.2,1.37],2,band);pixel([lunge-.03,far*.23,1.36],2,2,band);
  stroke(hilt,tip,3,ink);stroke(hilt,tip,1,steel);pixel(hilt,2,2,'#a98535');
}

/** Original hoplite pixels in the same olive/brass, eight-facing RTS scale. */
export function drawPhalanxFrame(ctx:CanvasRenderingContext2D,facing:number,frame:number){
  ctx.clearRect(0,0,48,48);
  const a=facing*Math.PI/4,fx=Math.cos(a),fy=Math.sin(a),sx=-fy,sy=fx;
  const dead=frame>=INFANTRY_DEATH,fall=dead?(frame-INFANTRY_DEATH)/7:0;
  const walk=frame>0&&frame<INFANTRY_ATTACK?Math.sin((frame-1)*Math.PI/3):0;
  const thrust=frame>=INFANTRY_ATTACK&&!dead?Math.sin(Math.min(1,(frame-INFANTRY_ATTACK)/7)*Math.PI)*4:0;
  const point=(x:number,y:number,z:number)=>[Math.round(24+fx*(x+fall*z*.25)+sx*y),Math.round(32+fy*(x+fall*z*.25)*.65+sy*y*.65-z*(1-fall*.9))];
  const box=(x:number,y:number,z:number,w:number,h:number,color:string)=>{const p=point(x,y,z);ctx.fillStyle=color;ctx.fillRect(p[0]-Math.floor(w/2),p[1]-Math.floor(h/2),w,h);};
  const line=(x:number,y:number,z:number,xx:number,yy:number,zz:number,color:string)=>{const p=point(x,y,z),q=point(xx,yy,zz),steps=Math.max(Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1]),1);ctx.fillStyle=color;for(let j=0;j<=steps;j++)ctx.fillRect(Math.round(p[0]+(q[0]-p[0])*j/steps),Math.round(p[1]+(q[1]-p[1])*j/steps),1,1);};
  box(0,0,0,9,2,'#18201688');
  for(const side of [-1,1]){box(walk*side*2,side*2,2,3,5,'#383e30');box(walk*side*2+1,side*2,0,3,2,'#20251f');}
  box(0,0,7,7,9,'#20251f');box(0,0,8,5,7,'#737b50');box(0,0,5,6,2,'#873e2b');
  box(0,0,13,5,5,'#20251f');box(0,0,14,5,3,'#ab9455');box(1,0,12,3,2,'#b58a5d');box(0,0,17,2,3,'#873e2b');
  // Spear stays level while all three ranks brace; attack extends its steel tip.
  line(-5+thrust,-2,9,17+thrust,-2,9,'#20251f');line(-5+thrust,-2,10,17+thrust,-2,10,'#8a7250');
  line(15+thrust,-2,10,18+thrust,-2,10,'#d3d5bd');box(4,-2,9,2,2,'#b58a5d');
  // Broad bronze round shield, dark rim and raised central boss.
  box(3,3,7,9,9,'#20251f');box(3,3,7,7,9,'#ab9455');box(3,3,7,9,5,'#ab9455');box(3,3,7,5,7,'#737b50');box(3,3,7,3,3,'#d9c688');
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
      if(kind==='phalanx'){drawPhalanxFrame(brush,facing,frame);ctx.drawImage(tile,x,y);continue;}
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

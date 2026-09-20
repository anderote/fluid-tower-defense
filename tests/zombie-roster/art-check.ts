import {drawZombieFrame} from '../../src/render/zombie-art.ts';
import {ZOMBIE_KINDS,ZOMBIE_FRAME,ZOMBIE_FRAMES,ZOMBIE_FACINGS} from '../../src/render/zombie-roster.ts';

export function checkZombieArt(){
  const tile=document.createElement('canvas');tile.width=tile.height=ZOMBIE_FRAME;
  const ctx=tile.getContext('2d',{willReadFrequently:true})!;
  let frames=0;
  for(const kind of ZOMBIE_KINDS)for(let facing=0;facing<ZOMBIE_FACINGS;facing++)for(let frame=0;frame<ZOMBIE_FRAMES;frame++){
    drawZombieFrame(ctx,kind,facing,frame);const data=ctx.getImageData(0,0,ZOMBIE_FRAME,ZOMBIE_FRAME).data;let pixels=0;
    for(let y=0;y<ZOMBIE_FRAME;y++)for(let x=0;x<ZOMBIE_FRAME;x++){
      const alpha=data[(y*ZOMBIE_FRAME+x)*4+3];
      if(alpha!==0&&alpha!==255)throw Error(`${kind} has a translucent cutout pixel`);
      if(alpha){pixels++;if(x===0||y===0||x===ZOMBIE_FRAME-1||y===ZOMBIE_FRAME-1)throw Error(`${kind} facing ${facing} frame ${frame} touches the atlas edge`);}
    }
    if(pixels<30)throw Error(`${kind} facing ${facing} frame ${frame} is empty`);
    frames++;
  }
  return frames;
}

/** Original infantry-style pixel art, baked once into a nearest-neighbor atlas. */
export const SHAMBLER_FRAME=32;
export const SHAMBLER_FACINGS=8;
export const SHAMBLER_FRAMES=16; // idle, 8 walk, stagger, 6 death
export const SHAMBLER_PIVOT={x:16,y:25};
type Point=[number,number,number];

export function drawShamblerFrame(ctx:CanvasRenderingContext2D,facing:number,frame:number){
  ctx.clearRect(0,0,32,32);ctx.imageSmoothingEnabled=false;
  const angle=facing*Math.PI/4,forward=[Math.cos(angle),Math.sin(angle)],side=[-forward[1],forward[0]];
  const walking=frame>=1&&frame<=8,phase=(frame-1)*Math.PI/4;
  const stride=walking?Math.sin(phase):0,bob=walking?Math.abs(Math.cos(phase))*.045:0;
  const falling=frame>=10,fall=falling?(frame-9)/6:0,stagger=frame===9;
  const lean=stagger?-.2:.1;
  const project=([x,y,z]:Point):[number,number]=>{
    const zz=z*(1-fall*.91),xx=x+z*fall*.72;
    return [Math.round(16+(forward[0]*xx+side[0]*y)*10),Math.round(25+(forward[1]*xx+side[1]*y)*6-zz*11)];
  };
  const line=(a:Point,b:Point,width:number,color:string)=>{
    const p=project(a),q=project(b);ctx.lineCap='square';ctx.lineJoin='miter';ctx.strokeStyle='#20251e';ctx.lineWidth=width+2;
    ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  };
  const polygon=(points:Point[],color:string)=>{
    ctx.beginPath();points.forEach((point,i)=>{const p=project(point);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.closePath();
    ctx.strokeStyle='#20251e';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.fill();
  };
  const limb=(s:number)=>{
    const step=stride*s*.25,hip:Point=[lean,s*.14,.76+bob],knee:Point=[step*.45,s*.16,.4],foot:Point=[step,s*.2,.05+Math.max(0,-stride*s)*.1];
    line(hip,knee,3,s*side[1]<0?'#444b43':'#596052');line(knee,foot,2,'#454c43');
    line([foot[0]-.06,foot[1],foot[2]],[foot[0]+.15,foot[1],foot[2]],3,'#292e29');
  };
  const arm=(s:number)=>{
    const shoulder:Point=[lean,s*.29,1.16+bob],elbow:Point=[.21+lean-stride*s*.08,s*.34,.91+bob],hand:Point=[.48+lean-stride*s*.12,s*.28,.89+bob];
    line(shoulder,elbow,3,s*side[1]<0?'#5d6450':'#818267');line(elbow,hand,2,'#9caa79');
  };
  const far=side[1]>0?-1:1;
  limb(far);limb(-far);arm(far);
  polygon([[lean-.15,-.24,.72+bob],[lean-.13,.24,.72+bob],[lean,.29,1.2+bob],[lean,-.29,1.2+bob]],'#74775d');
  // Lit shoulder, torn hem, belt and a blood-darkened tear.
  line([lean,-.21,1.2+bob],[lean,.2,1.2+bob],2,'#999982');
  line([lean,-.18,.77+bob],[lean,.18,.77+bob],1,'#353b30');
  const tear=project([lean+.015,.09,.97+bob]);ctx.fillStyle='#653e32';ctx.fillRect(tear[0],tear[1],2,3);
  arm(-far);
  const head=project([lean+.1,0,1.43+bob]);
  ctx.fillStyle='#252b22';ctx.fillRect(head[0]-3,head[1]-4,6,7);
  ctx.fillStyle='#a4b183';ctx.fillRect(head[0]-2,head[1]-3,4,5);
  ctx.fillStyle='#747f57';ctx.fillRect(head[0]-2,head[1]+1,4,2);
  ctx.fillStyle='#555d44';ctx.fillRect(head[0]-2,head[1]-4,4,2);
  if(forward[1]>-.4){
    const faceX=Math.round(forward[0]);ctx.fillStyle='#343b2b';ctx.fillRect(head[0]-1+faceX,head[1]-1,2,1);
    ctx.fillStyle='#c0c59a';ctx.fillRect(head[0]+faceX,head[1],1,1);
    ctx.fillStyle='#684739';ctx.fillRect(head[0]-1+faceX,head[1]+2,2,1);
  }
  // Quantize the painted outline to opaque pixels for clean depth-tested overlap.
  const pixels=ctx.getImageData(0,0,32,32);
  for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=pixels.data[i+3]>=128?255:0;
  ctx.putImageData(pixels,0,0);
}

export function createShamblerAtlas(){
  const canvas=document.createElement('canvas');canvas.width=SHAMBLER_FRAME*SHAMBLER_FRAMES;canvas.height=SHAMBLER_FRAME*SHAMBLER_FACINGS;
  const ctx=canvas.getContext('2d')!,tile=document.createElement('canvas');tile.width=tile.height=SHAMBLER_FRAME;
  const painter=tile.getContext('2d',{willReadFrequently:true})!;
  for(let facing=0;facing<SHAMBLER_FACINGS;facing++)for(let frame=0;frame<SHAMBLER_FRAMES;frame++){
    drawShamblerFrame(painter,facing,frame);ctx.drawImage(tile,frame*SHAMBLER_FRAME,facing*SHAMBLER_FRAME);
  }
  return canvas;
}

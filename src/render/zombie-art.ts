import {drawShamblerFrame} from './shambler-art.ts';
import {ZOMBIE_FRAME,ZOMBIE_FACINGS,ZOMBIE_FRAMES,ZOMBIE_KINDS,ZOMBIE_PIVOT,type ZombieKind} from './zombie-roster.ts';
type Point=[number,number,number];

/** Original painted infantry studies. Each body has its own proportions and gait. */
export function drawZombieFrame(ctx:CanvasRenderingContext2D,kind:ZombieKind,facing:number,frame:number){
  if(kind==='shambler'){drawShamblerFrame(ctx,facing,frame,ZOMBIE_PIVOT);return;}
  ctx.clearRect(0,0,ZOMBIE_FRAME,ZOMBIE_FRAME);ctx.imageSmoothingEnabled=false;
  const runner=kind==='runner',bloater=kind==='softbody',brute=kind==='brute';
  const angle=facing*Math.PI/4,f=[Math.cos(angle),Math.sin(angle)],s=[-f[1],f[0]];
  const walking=frame>=1&&frame<=8,phase=(frame-1)*Math.PI/4,stride=walking?Math.sin(phase):0;
  const fall=frame>=10?(frame-9)/6:0,stagger=frame===9;
  const sway=walking&&bloater?Math.sin(phase-.65)*.095:0;
  const bob=walking?(runner?Math.abs(Math.sin(phase))*.09:brute?Math.abs(Math.sin(phase))*.025:Math.cos(phase*2)*.025):0;
  const lean=stagger?-.18:runner?.32:bloater?.06:.08;
  const hip=runner?.84:bloater?.56:.73,shoulder=runner?1.25:bloater?1.18:1.3;
  const width=runner?.17:bloater?.39:.55,stance=runner?.13:bloater?.3:.29;
  const skin=runner?'#b7b18d':bloater?'#b0b08a':'#929e76';
  const outline='#232721',cloth=runner?'#6c6351':bloater?'#666459':'#626c60';
  const project=([x,y,z]:Point):[number,number]=>{
    const zz=z*(1-fall*.94),xx=x+z*fall*.68;
    return [Math.round(ZOMBIE_PIVOT.x+(f[0]*xx+s[0]*y)*10),Math.round(ZOMBIE_PIVOT.y+(f[1]*xx+s[1]*y)*6-zz*11)];
  };
  const line=(a:Point,b:Point,w:number,color:string)=>{
    const p=project(a),q=project(b);ctx.lineCap='square';ctx.lineJoin='miter';ctx.lineWidth=w+2;ctx.strokeStyle=outline;
    ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.lineWidth=w;ctx.strokeStyle=color;ctx.stroke();
  };
  const poly=(points:Point[],color:string)=>{
    ctx.beginPath();points.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();ctx.strokeStyle=outline;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.fill();
  };
  const spot=(p:Point,w:number,h:number,color:string)=>{const q=project(p);ctx.fillStyle=color;ctx.fillRect(q[0]-Math.floor(w/2),q[1]-Math.floor(h/2),w,h);};
  const leg=(side:number)=>{
    const step=stride*side*(runner?.42:bloater?.13:.2),lift=Math.max(0,-stride*side)*(runner?.24:bloater?.05:.08);
    const knee:Point=[step*.5,side*stance,.35+lift*.4],foot:Point=[step,side*(stance+.02),.04+lift];
    line([lean*.3,side*stance,hip],knee,runner?2:4,runner?'#70634f':'#484f45');
    line(knee,foot,runner?1:bloater?3:4,runner?skin:'#555b4d');
    line([foot[0]-.07,foot[1],foot[2]],[foot[0]+(brute?.24:.15),foot[1],foot[2]],brute?4:2,'#30362e');
  };
  const arm=(side:number)=>{
    const swing=stride*side;
    const upper:Point=[lean,side*width,shoulder+bob],elbow:Point=[lean+(runner?-swing*.3:.12),side*(width+.08),runner?.94:bloater?.85:.77];
    const hand:Point=[lean+(runner?.26-swing*.32:bloater?.27:.22),side*(width+.06),runner?.91:bloater?.67:.44];
    line(upper,elbow,runner?2:bloater?4:5,runner?cloth:brute?'#7c8670':skin);
    line(elbow,hand,runner?1:bloater?3:5,skin);if(brute)spot(hand,5,4,'#8b9570');
  };
  const far=s[1]>0?-1:1;
  leg(far);leg(-far);arm(far);
  if(bloater){
    // Pear-shaped belly rolls a fraction of a step behind the hips and shoulders.
    const ring=(z:number,r:number,front:number):Point[]=>Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return [lean+front+Math.cos(a)*r*.75,sway+Math.sin(a)*r,z+bob];});
    const lower=ring(.54,.43,.08),upper=ring(1.2,.28,0);
    poly([...lower.slice(0,7),...upper.slice(0,7).reverse()],cloth);
    const center=project([lean+.19,sway,.86+bob]);
    const bellyHeight=6*(1-fall*.65),back=f[1]<-.4;
    ctx.fillStyle=outline;ctx.beginPath();ctx.ellipse(center[0],center[1],7,bellyHeight+1,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.beginPath();ctx.ellipse(center[0],center[1],6,bellyHeight,0,0,Math.PI*2);ctx.clip();
    ctx.fillStyle=back?'#77776a':skin;ctx.fillRect(center[0]-7,center[1]-7,14,14);
    ctx.fillStyle=back?'#95957e':'#c5c29a';ctx.fillRect(center[0]-3,center[1]-Math.round(bellyHeight*.5),4,3);
    ctx.fillStyle=back?'#5d6453':'#8a906d';ctx.fillRect(center[0]+2,center[1],3,4);
    if(!back){ctx.fillStyle='#666e51';ctx.fillRect(center[0],center[1]+Math.round(bellyHeight*.3),1,2);}
    ctx.restore();
    line([lean,-.34,1.15+bob],[lean,-.24,.74+bob],2,cloth);
    line([lean,.34,1.15+bob],[lean,.27,.7+bob],2,cloth);
  }else{
    poly([[lean-.12,-width*.65,hip+bob],[lean-.12,width*.65,hip+bob],[lean,width,shoulder+bob],[lean,-width,shoulder+bob]],cloth);
    line([lean,-width*.8,shoulder+bob],[lean,width*.8,shoulder+bob],brute?3:1,brute?'#949782':'#a39473');
    if(runner){
      // Exposed ribs and shredded shirt leave a narrow, angular torso.
      line([lean,.1,1.16+bob],[lean,.1,.93+bob],2,skin);
      for(let i=0;i<3;i++)spot([lean+.02,.11,1.12-i*.07+bob],2,1,'#756f53');
    }else{
      line([lean,-.25,.83+bob],[lean,.25,.83+bob],2,'#353e35');
      spot([lean,-.35,1.19+bob],3,3,'#494b40');spot([lean,.12,1.02+bob],2,4,'#644a3c');
    }
  }
  arm(-far);
  const head=project([lean+(runner?.16:.04),bloater?sway*.45:0,(runner?1.49:bloater?1.39:1.52)+bob]);
  ctx.fillStyle=outline;ctx.fillRect(head[0]-2,head[1]-3,5,6);
  ctx.fillStyle=skin;ctx.fillRect(head[0]-1,head[1]-2,3,4);
  ctx.fillStyle=runner?'#68604c':bloater?'#898a6a':'#555f4a';ctx.fillRect(head[0]-1,head[1]-3,3,1);
  if(f[1]>-.4){const x=head[0]+Math.round(f[0]);ctx.fillStyle='#414532';ctx.fillRect(x,head[1]-1,1,1);ctx.fillStyle='#775343';ctx.fillRect(x,head[1]+1,2,1);}
  const pixels=ctx.getImageData(0,0,ZOMBIE_FRAME,ZOMBIE_FRAME);
  for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=pixels.data[i+3]>=128?255:0;
  ctx.putImageData(pixels,0,0);
}

export function createZombieAtlas(){
  const canvas=document.createElement('canvas');canvas.width=ZOMBIE_FRAME*ZOMBIE_FRAMES;canvas.height=ZOMBIE_FRAME*ZOMBIE_FACINGS*ZOMBIE_KINDS.length;
  const ctx=canvas.getContext('2d')!,tile=document.createElement('canvas');tile.width=tile.height=ZOMBIE_FRAME;
  const painter=tile.getContext('2d',{willReadFrequently:true})!;
  ZOMBIE_KINDS.forEach((kind,index)=>{for(let facing=0;facing<ZOMBIE_FACINGS;facing++)for(let frame=0;frame<ZOMBIE_FRAMES;frame++){
    drawZombieFrame(painter,kind,facing,frame);ctx.drawImage(tile,frame*ZOMBIE_FRAME,(index*ZOMBIE_FACINGS+facing)*ZOMBIE_FRAME);
  }});
  return canvas;
}

/** Small original pixel cutouts: head, arm, booted leg, torn torso. */
export function createRemnantAtlas(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=96;const ctx=canvas.getContext('2d')!;
  const palettes=[['#a4b183','#74775d'],['#b7b18d','#6c6351'],['#929e76','#626c60'],['#afa083','#795b49'],['#b0b08a','#666459'],['#a7ada0','#626964']];
  palettes.forEach(([skin,cloth],kind)=>{for(let part=0;part<4;part++){
    const x=part*16,y=kind*16;ctx.save();ctx.translate(x,y);ctx.fillStyle='#292b25';
    if(part===0){ctx.fillRect(5,4,6,7);ctx.fillStyle=skin;ctx.fillRect(6,5,4,5);ctx.fillStyle='#3a402f';ctx.fillRect(8,6,2,1);}
    if(part===1){ctx.fillRect(6,3,5,10);ctx.fillStyle=cloth;ctx.fillRect(7,4,3,4);ctx.fillStyle=skin;ctx.fillRect(7,8,2,4);}
    if(part===2){ctx.fillRect(6,3,5,10);ctx.fillRect(8,10,5,3);ctx.fillStyle=cloth;ctx.fillRect(7,4,3,6);ctx.fillStyle='#414637';ctx.fillRect(8,11,4,1);}
    if(part===3){ctx.fillRect(3,4,10,9);ctx.fillStyle=cloth;ctx.fillRect(4,5,8,7);ctx.fillStyle=skin;ctx.fillRect(6,4,3,2);ctx.fillStyle='#999980';ctx.fillRect(4,5,2,3);}
    ctx.fillStyle='#7c211c';ctx.fillRect(part===3?7:6,part===0?10:3,3,2);ctx.fillStyle='#b04431';ctx.fillRect(part===3?8:7,part===0?10:3,1,1);ctx.restore();
  }});
  return canvas;
}

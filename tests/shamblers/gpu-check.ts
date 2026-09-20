import {PARTICLE_BYTES} from '../../src/contracts/index.ts';
import {SHAMBLER_ANIMATION_WGSL,SHAMBLER_STATE_BYTES} from '../../src/render/shambler-animation.ts';
import {ENEMIES} from '../../src/content/index.ts';
import {ZOMBIE_KINDS} from '../../src/render/zombie-roster.ts';

/** Exercise the production animation shader, including slot reuse and impulses. */
export async function checkAnimation(device:GPUDevice){
  const particles=device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const state=device.createBuffer({size:SHAMBLER_STATE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const clock=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const readback=device.createBuffer({size:PARTICLE_BYTES+SHAMBLER_STATE_BYTES,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const module=device.createShaderModule({code:SHAMBLER_ANIMATION_WGSL});
  const compilation=await module.getCompilationInfo();
  if(compilation.messages.some(message=>message.type==='error'))throw Error(compilation.messages.map(message=>`${message.lineNum}: ${message.message}`).join('\n'));
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'update'}});
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[particles,state,clock].map((buffer,binding)=>({binding,resource:{buffer}}))});
  let time=0,checks=0;
  const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);checks++;};
  const p=new Float32Array([10,10,2,0,.4125,1,30,30,0,0,0,1,0,0,0,1]);
  async function step(dt:number,reset=false){
    time+=dt;device.queue.writeBuffer(particles,0,p);device.queue.writeBuffer(clock,0,new Float32Array([time,dt,1,reset?1:0]));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(1);pass.end();
    encoder.copyBufferToBuffer(state,0,readback,0,SHAMBLER_STATE_BYTES);encoder.copyBufferToBuffer(particles,0,readback,SHAMBLER_STATE_BYTES,PARTICLE_BYTES);
    device.queue.submit([encoder.finish()]);await readback.mapAsync(GPUMapMode.READ);const result=new Float32Array(readback.getMappedRange()).slice();readback.unmap();
    assert(p.every((value,i)=>value===result[12+i]),'Animation changed a physics particle');return result;
  }
  try{
   for(const kind of ZOMBIE_KINDS){
    const enemy=ENEMIES[kind];p.set([10,10,enemy.speed,0,enemy.radius,enemy.mass,enemy.health,enemy.health,0,0,enemy.index,1,0,0,0,1]);
    let a=await step(0,true);const phase=a[5];assert(a[4]===0,'Wrong initial heading');
    p[0]+=enemy.speed*.02;a=await step(.02);assert(a[7]===1&&a[5]!==phase,`${kind} mistook normal movement for knockback`);
    const walking=a.slice();a=await step(0);assert(a.every((v,i)=>v===walking[i]),'Pause changed animation');
    p[2]=0;a=await step(.02);assert(a[7]===0&&a[5]===walking[5],'Stationary zombie is moonwalking');
    p[0]-=.2;p[2]=-10;a=await step(.02);assert(a[7]===2&&Math.abs(a[4])<.001,'Knockback turned zombie around');
    p[11]=-1;p[7]=-time*60;a=await step(.02);assert(a[3]===0,'Death did not end the gait');
    p[11]=1;p[7]=enemy.health;p[15]=2;p[2]=0;p[3]=enemy.speed;a=await step(.02);assert(Math.abs(a[4]-Math.PI/2)<.001&&a[6]===0,'Recycled slot inherited old facing or stagger');
    p[3]=0;a=await step(0,true);assert(a[4]===0&&a[7]===0,'Reset retained animation state');
   }
    return checks;
  }finally{particles.destroy();state.destroy();clock.destroy();readback.destroy();}
}

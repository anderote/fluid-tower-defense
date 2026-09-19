import {PARTICLE_WGSL,PARTICLE_BYTES} from '../contracts/index.ts';
/** Tiny real-GPU round trip catches CPU/WGSL packing and writable-buffer failures. */
export async function verifyABI(device:GPUDevice):Promise<boolean>{
  const input = new Float32Array(Array.from({length:16},(_,i)=>i+.25));
  const buffer=device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const staging=device.createBuffer({size:PARTICLE_BYTES,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(buffer,0,input);
  const code=`${PARTICLE_WGSL} @group(0) @binding(0) var<storage,read_write> particles:array<Particle>; @compute @workgroup_size(1) fn main(){particles[0].pos+=vec4f(1);particles[0].body+=vec4f(2);particles[0].state+=vec4f(3);particles[0].status+=vec4f(4);}`;
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}});
  const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]}));pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(buffer,0,staging,0,PARTICLE_BYTES);device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);const actual=new Float32Array(staging.getMappedRange());const ok=input.every((value,i)=>actual[i]===value+1+Math.floor(i/4));staging.unmap();buffer.destroy();staging.destroy();return ok;
}

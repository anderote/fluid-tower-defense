import {PARTICLE_BYTES, PARTICLE_FLOATS, PARTICLE_WGSL, type SharedGPU} from '../../contracts/index.ts';

/** Reuses dead slots on the GPU; no full swarm upload or synchronous readback. */
export async function createHorde(device:GPUDevice,shared:SharedGPU){
  const incoming=device.createBuffer({label:'Horde arrival staging',size:shared.capacity*PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const params=device.createBuffer({label:'Horde arrival counts',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const cursor=device.createBuffer({label:'Horde allocation cursor',size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const module=device.createShaderModule({label:'Horde slot recycling',code:`${PARTICLE_WGSL}
@group(0) @binding(0) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(1) var<storage,read> incoming:array<Particle>;
@group(0) @binding(2) var<uniform> params:vec4u;
@group(0) @binding(3) var<storage,read_write> cursor:atomic<u32>;
@compute @workgroup_size(128) fn arrive(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=params.y||particles[i].state.w>.5){return;}
 let slot=atomicAdd(&cursor,1u);if(slot>=params.x){return;}
 var next=incoming[slot];next.status.w=particles[i].status.w+1.;particles[i]=next;
}`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'arrive'}});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[shared.particles,incoming,params,cursor].map((buffer,binding)=>({binding,resource:{buffer}}))});
  return {
    encode(encoder:GPUCommandEncoder,data:Float32Array,count:number){
      if(!data.length)return;
      device.queue.writeBuffer(incoming,0,data);device.queue.writeBuffer(params,0,new Uint32Array([data.length/PARTICLE_FLOATS,count,0,0]));
      encoder.clearBuffer(cursor);const pass=encoder.beginComputePass({label:'Horde arrivals'});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(count/128));pass.end();
    },
    reset(){device.queue.writeBuffer(shared.particles,0,new Float32Array(shared.capacity*PARTICLE_FLOATS));},
    destroy(){incoming.destroy();params.destroy();cursor.destroy();},
  };
}

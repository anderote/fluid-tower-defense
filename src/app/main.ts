import { connectGPU } from '../runtime/gpu.ts';
import { verifyABI } from '../runtime/abi-check.ts';
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = '<h1>Pressure Front</h1><p id="status">Checking WebGPU…</p><canvas width="800" height="500"></canvas>';
try {
 const {device,context,adapter} = await connectGPU(root.querySelector('canvas')!);
 const buffer=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
 const result=device.createBuffer({size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 const pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:'@group(0) @binding(0) var<storage,read_write> a: array<u32>; @compute @workgroup_size(1) fn main(){a[0]=42u;}'}),entryPoint:'main'}});
 const encoder=device.createCommandEncoder();
 const compute=encoder.beginComputePass();compute.setPipeline(pipeline);compute.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]}));compute.dispatchWorkgroups(1);compute.end();
 encoder.copyBufferToBuffer(buffer,0,result,0,16);
 const render=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.035,g:.06,b:.05,a:1},loadOp:'clear',storeOp:'store'}]});render.end();device.queue.submit([encoder.finish()]);
 await result.mapAsync(GPUMapMode.READ);const value=new Uint32Array(result.getMappedRange())[0];result.unmap();
 document.querySelector('#status')!.textContent=`${adapter} · compute result ${value} · ${value===42?'GPU foundation passed':'GPU test failed'}`;
 buffer.destroy();result.destroy();
 const abi=await verifyABI(device);document.querySelector('#status')!.textContent += ` · particle ABI ${abi?'passed':'FAILED'}`;
} catch(error){ document.querySelector('#status')!.textContent=String(error); }

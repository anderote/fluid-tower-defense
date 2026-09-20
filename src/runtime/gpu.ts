import { COUNTER_WORDS, MAX_PARTICLES, PARTICLE_BYTES, type SharedGPU } from '../contracts/index.ts';
export async function connectGPU(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. Open this game in a current Chrome or Safari with WebGPU enabled.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter is available. Check browser hardware acceleration.');
  // Dynamic terrain telemetry brings the physics stage to nine storage bindings.
  // WebGPU adapters may expose that capacity without granting it unless requested.
  const requiredStorageBuffers=9;
  if(adapter.limits.maxStorageBuffersPerShaderStage<requiredStorageBuffers)throw new Error(`This WebGPU adapter supports ${adapter.limits.maxStorageBuffersPerShaderStage} storage buffers per shader stage; Pressure Front requires ${requiredStorageBuffers}.`);
  const device = await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:requiredStorageBuffers}});
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not create a GPU canvas.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const shared: SharedGPU = {
    particles: device.createBuffer({label:'Shared swarm',size:MAX_PARTICLES * PARTICLE_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),
    counters: device.createBuffer({label:'Settlement counters',size:COUNTER_WORDS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),
    capacity: MAX_PARTICLES,
  };
  return {device,context,format,shared,adapter:adapter.info.description || adapter.info.device || adapter.info.vendor || 'Local WebGPU'};
}

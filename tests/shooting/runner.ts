import {SHOT_GEOMETRY_WGSL} from '../../src/render/shot-geometry.ts';
import {createRenderer} from '../../src/render/index.ts';
import type {RenderScene,SharedGPU} from '../../src/contracts/index.ts';

const status=document.querySelector('#status')!;
try{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice();
  device.addEventListener('uncapturederror',event=>{status.textContent=`FAIL: ${event.error.message}`;});
  device.pushErrorScope('validation');
  // Execute the production WGSL, then check the spatial invariant independently
  // on the CPU: every corner stays between muzzle and target at every shot age.
  const cases:number[]=[],expected:{angle:number;range:number;elapsed:number}[]=[];
  for(let facing=0;facing<64;facing++)for(const range of [-2,0,.1,1,8.5,30])for(const elapsed of [0,.001,.008,.03,.058,.12]){
    const angle=facing*Math.PI/32;cases.push(angle,range,elapsed,0);expected.push({angle,range,elapsed});
  }
  const input=device.createBuffer({size:cases.length*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const output=device.createBuffer({size:expected.length*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const readback=device.createBuffer({size:output.size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(input,0,new Float32Array(cases));
  const module=device.createShaderModule({code:`${SHOT_GEOMETRY_WGSL}
@group(0) @binding(0) var<storage,read> cases:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read_write> result:array<vec2<f32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=arrayLength(&cases)){return;}let c=cases[id.x];let f=vec2(cos(c.x),sin(c.x));
 let corners=array<vec2<f32>,4>(vec2(-1.,-1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
 for(var i=0u;i<4u;i++){result[id.x*4u+i]=autocannonTracer(corners[i],vec2(10.,20.),f,c.y,c.z);}
}`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
  pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(Math.ceil(expected.length/64));pass.end();
  encoder.copyBufferToBuffer(output,0,readback,0,output.size);device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const points=new Float32Array(readback.getMappedRange());
  expected.forEach(({angle,range,elapsed},i)=>{
    const projections:number[]=[];
    for(let corner=0;corner<4;corner++){
      const x=points[i*8+corner*2]-10,y=points[i*8+corner*2+1]-20;
      const along=x*Math.cos(angle)+y*Math.sin(angle),across=-x*Math.sin(angle)+y*Math.cos(angle);
      if(!Number.isFinite(along)||along<-.0001||along>Math.max(0,range)+.0001||Math.abs(across)>.1301)throw Error(`Tracer left muzzle/target bounds: case ${i}, corner ${corner}`);
      projections.push(along);
    }
    if(elapsed===0&&Math.max(...projections)>.0001)throw Error('Tracer appeared before launch');
    if(elapsed>=.058&&Math.abs(Math.max(...projections)-Math.max(0,range))>.0001)throw Error('Tracer never reached target');
    if(Math.max(...projections)-Math.min(...projections)>10.5001)throw Error('Tracer exceeded maximum length');
  });
  readback.unmap();input.destroy();output.destroy();readback.destroy();
  const canvas=document.querySelector('canvas')!,context=canvas.getContext('webgpu')!;
  const shots=device.createBuffer({size:64*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const shared:SharedGPU={particles:device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE}),counters:device.createBuffer({size:512,usage:GPUBufferUsage.STORAGE}),capacity:1,shotState:shots};
  const renderer=await createRenderer(device,context,navigator.gpu.getPreferredCanvasFormat(),shared,canvas);
  const scene:RenderScene={count:0,time:1,heatmap:false,selection:null,effects:[],map:{id:'shooting',width:100,height:56,obstacles:[],spawn:{x:0,y:0,width:0,height:0},goal:{x:100,y:56},goalRadius:0},towers:Array.from({length:8},(_,i)=>({id:i+1,kind:'autocannon',x:13+i%4*25,y:14+Math.floor(i/4)*28,angle:i*Math.PI/4,level:0,branch:-1,cooldown:0,spent:0}))};
  const draw=()=>{
    const elapsed=Number((document.querySelector('#age') as HTMLSelectElement).value),range=Number((document.querySelector('#range') as HTMLSelectElement).value),data=new Float32Array(64*12);
    scene.towers.forEach((t,i)=>data.set([1,1+elapsed,t.x+Math.cos(t.angle)*range,t.y+Math.sin(t.angle)*range,1,0,0,t.angle,t.id,1,0,0],i*12));
    device.queue.writeBuffer(shots,0,data);const encoder=device.createCommandEncoder();renderer.encode(encoder,scene);device.queue.submit([encoder.finish()]);
  };
  document.querySelectorAll('select').forEach(select=>select.addEventListener('change',draw));draw();
  await device.queue.onSubmittedWorkDone();const error=await device.popErrorScope();if(error)throw Error(error.message);
  status.textContent=`PASS: ${expected.length*4} GPU tracer corners checked; renderer validated.`;
  window.addEventListener('pagehide',()=>{renderer.destroy();shots.destroy();shared.particles.destroy();shared.counters.destroy();device.destroy();});
}catch(error){status.textContent=`FAIL: ${String(error)}`;}

import type {RenderScene} from '../contracts/index.ts';
import {PHYSICS_CELL_SIZE} from '../sim/physics/model.ts';
import {CORPSE_FIELD_SCALE,CORPSE_FIELD_WORD_OFFSET,MAX_CORPSE_FIELD_CELLS} from '../sim/physics/corpse-field.ts';

export async function createCorpseFieldRenderer(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,field:GPUBuffer){
  const params=device.createBuffer({label:'Corpse terrain display parameters',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const module=device.createShaderModule({label:'Corpse terrain heatmap',code:`
struct Camera {viewport:vec4f,world:vec4f,time:vec4f};
struct Params {width:u32,height:u32,cellSize:f32,approach:f32};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<storage,read> field:array<u32>;
@group(0) @binding(2) var<uniform> params:Params;
struct Out {@builtin(position) pos:vec4f,@location(0) local:vec2f,@location(1) height:f32};
fn clip(p:vec2f)->vec2f{let aspect=camera.viewport.x/max(1.,camera.viewport.y);let worldAspect=camera.world.z/camera.world.w;let sx=min(1.,worldAspect/aspect);let sy=min(1.,aspect/worldAspect);return vec2f((((p.x-camera.world.x)/camera.world.z)*2.-1.)*sx,(1.-((p.y-camera.world.y)/camera.world.w)*2.)*sy);}
@vertex fn vs(@builtin(vertex_index) vi:u32,@builtin(instance_index) ii:u32)->Out{
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
 let cell=vec2u(ii%params.width,ii/params.width);let q=corners[vi];let center=(vec2f(cell)+.5)*params.cellSize-vec2f(params.approach,0);
 let mass=f32(field[${CORPSE_FIELD_WORD_OFFSET}u+ii])/${CORPSE_FIELD_SCALE};let height=mass/(params.cellSize*params.cellSize);
 var o:Out;o.pos=vec4f(clip(center+q*params.cellSize*.54),0,1);o.local=q;o.height=height;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4f{
 if(i.height<.018){discard;}let strength=clamp(log2(1.+i.height)*.62,0.,1.);let edge=1.-smoothstep(.65,1.,length(i.local));
 return vec4f(mix(vec3f(.2,.055,.025),vec3f(.48,.11,.035),strength),(.035+.2*strength)*edge);
}`});
  const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
  const pipeline=await device.createRenderPipelineAsync({label:'Corpse terrain heatmap',layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:{buffer:field}},{binding:2,resource:{buffer:params}}]});
  let count=0,visible=false;
  return {
    prepare(scene:RenderScene){
      const approach=Math.max(0,scene.corpseFieldApproach??0),width=Math.ceil((scene.map.width+approach)/PHYSICS_CELL_SIZE),height=Math.ceil(scene.map.height/PHYSICS_CELL_SIZE);
      count=Math.min(MAX_CORPSE_FIELD_CELLS,width*height);visible=scene.heatmap&&scene.aftermathVisible!==false;
      device.queue.writeBuffer(params,0,new Uint32Array([width,height]));device.queue.writeBuffer(params,8,new Float32Array([PHYSICS_CELL_SIZE,approach]));
    },
    draw(pass:GPURenderPassEncoder){if(!visible||!count)return;pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(6,count);},
    destroy(){params.destroy();},
  };
}

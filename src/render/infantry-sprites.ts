import type {RenderScene} from '../contracts/index.ts';
import {createInfantryAtlas} from './infantry-art.ts';
import {createInfantryAnimator,INFANTRY_FRAME,INFANTRY_KINDS,INFANTRY_PIVOT,INFANTRY_PIXEL} from './infantry-animation.ts';
import {MAX_INFANTRY} from '../infantry/model.ts';

export async function createInfantrySprites(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer){
  const atlas=await createInfantryAtlas();
  const texture=device.createTexture({label:'Directional Red Alert infantry',size:[atlas.width,atlas.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:atlas},{texture},[atlas.width,atlas.height]);
  const instances=device.createBuffer({label:'Infantry sprite instances',size:MAX_INFANTRY*2*64,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const shader=device.createShaderModule({label:'Foot-sorted infantry sprites',code:`
struct Camera{viewport:vec4<f32>,world:vec4<f32>,time:vec4<f32>};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var atlas:texture_2d<f32>;
struct Out{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,@location(1) tint:vec4<f32>};
fn clip(p:vec2<f32>)->vec2<f32>{let aspect=camera.viewport.x/camera.viewport.y;let worldAspect=camera.world.z/camera.world.w;return vec2((((p.x-camera.world.x)/camera.world.z)*2.-1.)*min(1.,worldAspect/aspect),(1.-((p.y-camera.world.y)/camera.world.w)*2.)*min(1.,aspect/worldAspect));}
@vertex fn vs(@builtin(vertex_index) v:u32,@location(0) box:vec4<f32>,@location(1) uv:vec4<f32>,@location(2) tint:vec4<f32>,@location(3) ground:vec4<f32>)->Out{
 let q=array<vec2<f32>,6>(vec2(0.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(1.,0.),vec2(1.,1.))[v];
 let depth=select(clamp(.95-(ground.x-camera.world.y)/camera.world.w*.8,.01,.99),.995,ground.y>.5);
 var o:Out;o.pos=vec4(clip(box.xy+q*box.zw),depth,1.);o.uv=uv.xy+q*uv.zw;o.tint=tint;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{let pixel=textureLoad(atlas,vec2<i32>(floor(i.uv)),0);if(pixel.a<.1||i.tint.a<.01){discard;}return pixel*i.tint;}
`});
  const pipeline=await device.createRenderPipelineAsync({label:'Infantry cutouts',layout:'auto',vertex:{module:shader,entryPoint:'vs',buffers:[{arrayStride:64,stepMode:'instance',attributes:[0,1,2,3].map(i=>({shaderLocation:i,offset:i*16,format:'float32x4' as GPUVertexFormat}))}]},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'}});
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:texture.createView()}]});
  const animator=createInfantryAnimator();let count=0;
  return {
    prepare(scene:RenderScene){
      const soldiers=(scene.infantry?.soldiers??[]).slice(0,MAX_INFANTRY*2),poses=animator.prepare(soldiers,scene.time);
      count=soldiers.length;if(!count)return;
      const data=new Float32Array(count*16);
      soldiers.forEach((s,i)=>{const p=poses[i],row=INFANTRY_KINDS.indexOf(s.kind??'rifle')*8+p.facing;
        data.set([s.x-INFANTRY_PIVOT.x*INFANTRY_PIXEL,s.y-INFANTRY_PIVOT.y*INFANTRY_PIXEL,INFANTRY_FRAME*INFANTRY_PIXEL,INFANTRY_FRAME*INFANTRY_PIXEL,p.frame*INFANTRY_FRAME,row*INFANTRY_FRAME,INFANTRY_FRAME,INFANTRY_FRAME,1,1,1,p.alpha,s.y,s.health<=0?1:0,0,0],i*16);
      });
      device.queue.writeBuffer(instances,0,data);
    },
    draw(pass:GPURenderPassEncoder){if(count){pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.setVertexBuffer(0,instances);pass.draw(6,count);}},
    destroy(){texture.destroy();instances.destroy();},
  };
}

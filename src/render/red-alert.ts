import type {Rect,RenderScene,TowerKind} from '../contracts/index.ts';

type Frame={x:number;y:number;width:number;height:number};
type Atlas={size:number;frames:Frame[];sprites:Record<string,number[]>};
export const RA_TILE_WORLD=4;
const DEFENSES:Partial<Record<TowerKind,string>>={autocannon:'gun',tesla:'tsla',incinerator:'ftur'};
export const redAlertFacing=(angle:number)=>((24-Math.round(angle*16/Math.PI))%32+32)%32;
export const hasRedAlertSprite=(kind:TowerKind)=>kind in DEFENSES;
const same=(a:Rect,b:Rect)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;

/** Split authored rectangles at the tile grid, retaining exact collision bounds. */
export function wallTiles(obstacles:readonly Rect[]){
  const occupied=(x:number,y:number)=>obstacles.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);
  const result:(Rect&{south:boolean;west:boolean;east:boolean})[]=[];
  const seen=new Set<string>();
  for(const o of obstacles)for(let y=o.y;y<o.y+o.height;){
    const height=Math.min(o.y+o.height-y,4-((y%4+4)%4));
    for(let x=o.x;x<o.x+o.width;){
      const width=Math.min(o.x+o.width-x,4-((x%4+4)%4));
      const key=[x,y,width,height].join(',');
      if(!seen.has(key)){seen.add(key);result.push({x,y,width,height,south:!occupied(x+width/2,y+height+.001),west:!occupied(x-.001,y+height/2),east:!occupied(x+width+.001,y+height/2)});}x+=width;
    }y+=height;
  }
  return result;
}

/** Original palette sprites, drawn with nearest texel access and fixed pivots. */
export async function createRedAlertArt(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer){
  const response=await fetch('/assets/red-alert/atlas.json');
  if(!response.ok)throw Error('Red Alert atlas is missing. Run npm run assets:red-alert.');
  const atlas:Atlas=await response.json();
  if(!atlas.frames?.length||!atlas.sprites?.floor?.length)throw Error('Invalid Red Alert atlas');
  const imageResponse=await fetch('/assets/red-alert/atlas.png');
  if(!imageResponse.ok)throw Error('Red Alert texture is missing');
  const bitmap=await createImageBitmap(await imageResponse.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const texture=device.createTexture({label:'Original Red Alert sprite atlas',size:[atlas.size,atlas.size],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:bitmap},{texture},[atlas.size,atlas.size]);bitmap.close();
  const shader=device.createShaderModule({label:'Red Alert nearest-pixel sprites',code:`
struct Camera{viewport:vec4<f32>,world:vec4<f32>,time:vec4<f32>};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var atlas:texture_2d<f32>;
struct Out{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,@location(1) tint:vec4<f32>};
@vertex fn vs(@builtin(vertex_index) id:u32,@location(0) rect:vec4<f32>,@location(1) source:vec4<f32>,@location(2) tint:vec4<f32>)->Out{
 let corners=array<vec2<f32>,6>(vec2(0.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(1.,0.),vec2(1.,1.));let q=corners[id];let p=rect.xy+q*rect.zw;
 let aspect=camera.viewport.x/camera.viewport.y;let worldAspect=camera.world.z/camera.world.w;let scale=vec2(min(1.,worldAspect/aspect),min(1.,aspect/worldAspect));
 var o:Out;o.pos=vec4((vec2(2.,-2.)*(p-camera.world.xy)/camera.world.zw+vec2(-1.,1.))*scale,0.,1.);
 o.uv=source.xy+q*source.zw;o.tint=tint;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{let pixel=textureLoad(atlas,vec2<i32>(floor(i.uv)),0);if(pixel.a<.01){discard;}return pixel*i.tint;}`});
  const info=await shader.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>m.message).join('\n'));
  const pipeline=device.createRenderPipeline({label:'Red Alert sprites',layout:'auto',vertex:{module:shader,entryPoint:'vs',buffers:[{arrayStride:48,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x4'},{shaderLocation:2,offset:32,format:'float32x4'}]}]},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:texture.createView()}]});
  const createBatch=(label:string)=>({buffer:device.createBuffer({label,size:48,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),capacity:1,count:0});
  const terrain=createBatch('Facility tiles'),towers=createBatch('Original defense sprites');
  const upload=(batch:ReturnType<typeof createBatch>,data:number[])=>{
    batch.count=data.length/12;if(batch.count>batch.capacity){batch.buffer.destroy();batch.capacity=2**Math.ceil(Math.log2(batch.count));batch.buffer=device.createBuffer({size:batch.capacity*48,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
    if(data.length)device.queue.writeBuffer(batch.buffer,0,new Float32Array(data));
  };
  function sprite(data:number[],id:number,x:number,y:number,width:number,height:number,tint=[1,1,1,1],crop?:Frame){
    const f=crop??atlas.frames[id];data.push(x,y,width,height,f.x,f.y,f.width,f.height,...tint);
  }
  let terrainKey='';
  function prepare(scene:RenderScene){
    const obstacles=scene.map.obstacles.filter(o=>!(scene.wires??[]).some(w=>!w.breached&&same(o,w)));
    const key=JSON.stringify([scene.map.width,scene.map.height,obstacles]);
    if(key!==terrainKey){
      const data:number[]=[],floor=atlas.sprites.floor;
      for(let y=0;y<scene.map.height;y+=4)for(let x=0;x<scene.map.width;x+=4){
        // Keep most plates clean; the original set's scorched variants are sparse.
        const hash=((Math.imul(x+7,73856093)^Math.imul(y+11,19349663))>>>0),variant=hash%13===0?hash%floor.length:hash%2;
        const width=Math.min(4,scene.map.width-x),height=Math.min(4,scene.map.height-y),frame=atlas.frames[floor[variant]];
        sprite(data,floor[variant],x,y,width,height,[1,1,1,1],{...frame,width:width*6,height:height*6});
      }
      for(const tile of wallTiles(obstacles)){
        // The original vertical cap tile connects continuously. South-facing ends
        // use the original cap + shaded wall face instead of rotating a texture.
        const name=tile.south?'wall2':tile.east?'wall12':tile.west?'wall13':'wall14',id=atlas.sprites[name][0],frame=atlas.frames[id];
        sprite(data,id,tile.x,tile.y,tile.width,tile.height,[1,1,1,1],{...frame,width:tile.width*6,height:tile.height*6});
      }
      upload(terrain,data);terrainKey=key;
    }
    const data:number[]=[];
    const draw=(t:{kind:TowerKind;x:number;y:number;angle?:number},tint?:number[])=>{
      const name=DEFENSES[t.kind];if(!name)return;
      const frameIndex=name==='gun'?redAlertFacing(t.angle??0):0,id=atlas.sprites[name][frameIndex],f=atlas.frames[id];
      // Six source pixels per world unit matches the 24-pixel/4-world-cell floor.
      // Tesla's original 48px canvas is anchored at its base, not its image center.
      sprite(data,id,t.x-f.width/12,t.y-f.height/12-(name==='tsla'?13/6:name==='ftur'?2/6:0),f.width/6,f.height/6,tint);
    };
    [...scene.towers].sort((a,b)=>a.y-b.y).forEach(t=>draw(t));
    if(scene.ghost)draw(scene.ghost,scene.ghost.valid?[.7,1,.7,.65]:[1,.3,.3,.65]);
    upload(towers,data);
  }
  function draw(pass:GPURenderPassEncoder,batch:ReturnType<typeof createBatch>){if(!batch.count)return;pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.setVertexBuffer(0,batch.buffer);pass.draw(6,batch.count);}
  return {prepare,drawTerrain:(pass:GPURenderPassEncoder)=>draw(pass,terrain),drawTowers:(pass:GPURenderPassEncoder)=>draw(pass,towers),destroy(){terrain.buffer.destroy();towers.buffer.destroy();texture.destroy();}};
}

import type {Rect,RenderScene,TowerKind} from '../contracts/index.ts';
import {createSoldatAtlas,soldatFacing,soldatSpriteKey,SOLDAT_WORLD_SIZE} from './soldat-art.ts';
import {wireTiles,wireDamage,type WireArtStyle} from './wire-art.ts';
export type TurretArtStyle='soldat'|'red-alert';
export type FloorArtStyle='panels'|'grating';
export const floorSprites=(sprites:Record<string,number[]>,style:FloorArtStyle='panels')=>style==='grating'&&sprites.grating?.length?sprites.grating:sprites.floor;

type Frame={x:number;y:number;width:number;height:number};
type Atlas={size:number;frames:Frame[];sprites:Record<string,number[]>};
export const RA_TILE_WORLD=4;
const DEFENSES:Partial<Record<TowerKind,string>>={autocannon:'gun',tesla:'tsla',incinerator:'ftur'};
export const redAlertFacing=(angle:number)=>((24-Math.round(angle*16/Math.PI))%32+32)%32;
export const hasRedAlertSprite=(kind:TowerKind,style:TurretArtStyle='soldat')=>style==='soldat'||kind in DEFENSES;
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
export async function createRedAlertArt(device:GPUDevice,format:GPUTextureFormat,camera:GPUBuffer,style:TurretArtStyle='soldat',wireStyle:WireArtStyle='barb',floorStyle:FloorArtStyle='panels'){
  const response=await fetch('/assets/red-alert/atlas.json');
  if(!response.ok)throw Error('Red Alert atlas is missing. Run npm run assets:red-alert.');
  const atlas:Atlas=await response.json();
  if(!atlas.frames?.length||!atlas.sprites?.floor?.length)throw Error('Invalid Red Alert atlas');
  const wireFrames=atlas.sprites[wireStyle],hasWireSprites=wireFrames?.length>=32;
  const imageResponse=await fetch('/assets/red-alert/atlas.png');
  if(!imageResponse.ok)throw Error('Red Alert texture is missing');
  const bitmap=await createImageBitmap(await imageResponse.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  let customSprites:Record<string,number[]>|undefined;
  let customCanvas:HTMLCanvasElement|undefined;
  const customOffset=bitmap.height;
  let textureWidth=atlas.size,textureHeight=atlas.size;
  if(style==='soldat'){
    const custom=createSoldatAtlas(),offset=atlas.frames.length;customCanvas=custom.canvas;
    customSprites=Object.fromEntries(Object.entries(custom.sprites).map(([kind,ids])=>[kind,ids.map(id=>id+offset)]));
    atlas.frames.push(...custom.frames.map(frame=>({...frame,y:frame.y+customOffset})));
    textureWidth=Math.max(textureWidth,custom.canvas.width);textureHeight=customOffset+custom.canvas.height;
  }
  const texture=device.createTexture({label:'Original Red Alert sprite atlas',size:[textureWidth,textureHeight],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:bitmap},{texture},[bitmap.width,bitmap.height]);bitmap.close();
  if(customCanvas)device.queue.copyExternalImageToTexture({source:customCanvas},{texture,origin:[0,customOffset]},[customCanvas.width,customCanvas.height]);
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
  const terrain=createBatch('Facility floor'),walls=createBatch('Facility walls'),sceneryProps=createBatch('Landscape trees and buildings'),towers=createBatch('Original defense sprites'),wireBatch=createBatch('Connected Red Alert wire'),wireGhost=createBatch('Wire placement preview');
  const upload=(batch:ReturnType<typeof createBatch>,data:number[])=>{
    batch.count=data.length/12;if(batch.count>batch.capacity){batch.buffer.destroy();batch.capacity=2**Math.ceil(Math.log2(batch.count));batch.buffer=device.createBuffer({size:batch.capacity*48,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
    if(data.length)device.queue.writeBuffer(batch.buffer,0,new Float32Array(data));
  };
  function sprite(data:number[],id:number,x:number,y:number,width:number,height:number,tint=[1,1,1,1],crop?:Frame){
    const f=crop??atlas.frames[id];data.push(x,y,width,height,f.x,f.y,f.width,f.height,...tint);
  }
  let terrainKey='',wireKey='',previousScenery:RenderScene['map']['scenery'],sceneryVersion=0;
  function prepare(scene:RenderScene){
    const scenery=scene.map.scenery,biome=scenery?.biome;
    if(previousScenery!==scenery){previousScenery=scenery;sceneryVersion++;}
    const landscapeAvailable=biome&&biome!=='interior'&&atlas.sprites[`${biome}:clear1`]?.length;
    const obstacles=scene.map.obstacles.filter(o=>!(scene.wires??[]).some(w=>!w.breached&&same(o,w))&&!((landscapeAvailable||biome==='interior')&&scenery?.solids.some(r=>same(r,o))));
    const key=JSON.stringify([scene.map.width,scene.map.height,sceneryVersion,obstacles]);
    if(key!==terrainKey){
      const data:number[]=[],floor=landscapeAvailable?atlas.sprites[`${biome}:clear1`]:floorSprites(atlas.sprites,floorStyle);
      for(let y=0;y<scene.map.height;y+=4)for(let x=0;x<scene.map.width;x+=4){
        // Keep most plates clean; the original set's scorched variants are sparse.
        const hash=((Math.imul(x+7,73856093)^Math.imul(y+11,19349663))>>>0),variant=landscapeAvailable?hash%floor.length:hash%13===0?hash%floor.length:hash%2;
        const width=Math.min(4,scene.map.width-x),height=Math.min(4,scene.map.height-y),frame=atlas.frames[floor[variant]];
        sprite(data,floor[variant],x,y,width,height,[1,1,1,1],{...frame,width:width*6,height:height*6});
      }
      for(const region of scenery?.regions??[]){
        const ids=atlas.sprites[region.sprite];if(!ids)continue;
        for(let y=region.y;y<region.y+region.height;y+=4)for(let x=region.x;x<region.x+region.width;x+=4){const id=ids[0],frame=atlas.frames[id],width=Math.min(4,region.x+region.width-x),height=Math.min(4,region.y+region.height-y);sprite(data,id,x,y,width,height,[1,1,1,1],{...frame,width:width*6,height:height*6});}
      }
      for(const stamp of scenery?.tiles??[]){
        const ids=atlas.sprites[stamp.sprite];if(!ids)continue;
        for(let i=0;i<Math.min(ids.length,stamp.columns*stamp.rows);i++)sprite(data,ids[i],stamp.x+(i%stamp.columns)*4,stamp.y+Math.floor(i/stamp.columns)*4,4,4);
      }
      upload(terrain,data);
      const wallData:number[]=[];
      for(const tile of wallTiles(obstacles)){
        // The original vertical cap tile connects continuously. South-facing ends
        // use the original cap + shaded wall face instead of rotating a texture.
        const name=tile.south?'wall2':tile.east?'wall12':tile.west?'wall13':'wall14',id=atlas.sprites[name][0],frame=atlas.frames[id];
        sprite(wallData,id,tile.x,tile.y,tile.width,tile.height,[1,1,1,1],{...frame,width:tile.width*6,height:tile.height*6});
      }
      upload(walls,wallData);terrainKey=key;
      const props:number[]=[];
      for(const prop of [...scenery?.props??[]].sort((a,b)=>a.y-b.y)){
        const id=atlas.sprites[prop.sprite]?.[0];if(id===undefined)continue;const f=atlas.frames[id];
        sprite(props,id,prop.x-f.width/12,prop.y-f.height/6,f.width/6,f.height/6);
      }
      upload(sceneryProps,props);
    }
    const wires=scene.wires??[];
    const nextWireKey=JSON.stringify(wires.map(w=>[w.x,w.y,w.width,w.height,wireDamage(w)]));
    if(hasWireSprites&&nextWireKey!==wireKey){
      const data:number[]=[];
      for(const tile of wireTiles(wires)){
        const breached=tile.damage==='breached',id=wireFrames[breached?16+tile.debrisMask:tile.mask],frame=atlas.frames[id];
        const tint=breached?[.72,.65,.54,1]:tile.damage==='intact'?[1,1,1,1]:tile.damage==='worn'?[.88,.79,.65,1]:[.74,.61,.46,1];
        const crop={...frame,width:tile.width*6,height:tile.height*6};
        if(tile.damage==='frayed'){
          // Fallen scraps surround surviving central strands. Keep the full
          // north/south spine as well as the east/west rail: damaged vertical
          // runs must not look like a row of already-open breaches.
          const fallenId=wireFrames[16+tile.mask],fallen=atlas.frames[fallenId];
          sprite(data,fallenId,tile.x,tile.y,tile.width,tile.height,tint,{...fallen,width:crop.width,height:crop.height});
          const pieces=wireStyle==='barb'?[[8,0,8,24],[0,7,8,9],[16,7,8,9]]:[[0,0,24,24]];
          for(const [px,py,pw,ph] of pieces){
            const width=Math.min(pw,crop.width-px),height=Math.min(ph,crop.height-py);if(width<=0||height<=0)continue;
            sprite(data,id,tile.x+px/6,tile.y+py/6,width/6,height/6,tint,{x:frame.x+px,y:frame.y+py,width,height});
          }
        }else sprite(data,id,tile.x,tile.y,tile.width,tile.height,tint,crop);
      }
      upload(wireBatch,data);wireKey=nextWireKey;
    }
    const preview:number[]=[],ghost=scene.placementGhost;
    if(hasWireSprites&&ghost?.kind==='wire'){
      const previewWire={...ghost,health:1,maxHealth:1,breached:false};
      const ghostTiles=wireTiles([previewWire],[...wires,previewWire]);
      for(const tile of ghostTiles){const id=wireFrames[tile.mask],frame=atlas.frames[id];sprite(preview,id,tile.x,tile.y,tile.width,tile.height,ghost.valid?[.55,1,.7,.8]:[1,.3,.2,.8],{...frame,width:tile.width*6,height:tile.height*6});}
    }
    upload(wireGhost,preview);
    const data:number[]=[];
    const draw=(t:{kind:TowerKind;x:number;y:number;angle?:number;level?:number},tint?:number[])=>{
      if(customSprites){
        sprite(data,customSprites[soldatSpriteKey(t.kind,t.level)][soldatFacing(t.angle??0)],t.x-SOLDAT_WORLD_SIZE/2,t.y-SOLDAT_WORLD_SIZE/2,SOLDAT_WORLD_SIZE,SOLDAT_WORLD_SIZE,tint);return;
      }
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
  return {prepare,hasWireSprites,drawFloor:(pass:GPURenderPassEncoder)=>draw(pass,terrain),drawStructures:(pass:GPURenderPassEncoder)=>{draw(pass,walls);draw(pass,wireBatch);draw(pass,sceneryProps);},drawTowers:(pass:GPURenderPassEncoder)=>{draw(pass,towers);draw(pass,wireGhost);},destroy(){terrain.buffer.destroy();walls.buffer.destroy();sceneryProps.buffer.destroy();towers.buffer.destroy();wireBatch.buffer.destroy();wireGhost.buffer.destroy();texture.destroy();}};
}

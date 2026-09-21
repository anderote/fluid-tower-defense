import type {Rect,RenderScene,TowerKind} from '../contracts/index.ts';
import {createSoldatAtlas,soldatFacing,soldatSpriteKey,SOLDAT_WORLD_SIZE} from './soldat-art.ts';
import {wireTiles,wireDamage,type WireArtStyle} from './wire-art.ts';
export type TurretArtStyle='soldat'|'red-alert';
export type FloorArtStyle='panels'|'grating';
export const floorSprites=(sprites:Record<string,number[]>,style:FloorArtStyle='panels')=>style==='grating'&&sprites.grating?.length?sprites.grating:sprites.floor;

type Frame={x:number;y:number;width:number;height:number};
type Atlas={size:number;frames:Frame[];sprites:Record<string,number[]>};
export const RA_TILE_WORLD=4;
const assetBase=(import.meta as ImportMeta&{env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
const DEFENSES:Partial<Record<TowerKind,string>>={autocannon:'gun',tesla:'tsla',incinerator:'ftur'};
export const redAlertFacing=(angle:number)=>((24-Math.round(angle*16/Math.PI))%32+32)%32;
export const hasRedAlertSprite=(kind:TowerKind,style:TurretArtStyle='soldat')=>style==='soldat'||kind in DEFENSES;
/**
 * These are the two fixed defenses whose original Red Alert silhouettes are
 * part of their identity.  Keep the project's directional artwork for every
 * other weapon in the default view, but do not replace the Coil or Flame
 * Tower with a merely similar-looking model.
 */
export const usesClassicDefenseSprite=(kind:TowerKind)=>kind==='tesla'||kind==='incinerator';
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
  const response=await fetch(`${assetBase}assets/red-alert/atlas.json`);
  if(!response.ok)throw Error('Red Alert atlas is missing. Run npm run assets:red-alert.');
  const atlas:Atlas=await response.json();
  if(!atlas.frames?.length||!atlas.sprites?.floor?.length)throw Error('Invalid Red Alert atlas');
  const wireFrames=atlas.sprites[wireStyle],fenceFrames=atlas.sprites.cycl,hasWireSprites=wireFrames?.length>=32,hasFenceSprites=fenceFrames?.length>=32;
  const imageResponse=await fetch(`${assetBase}assets/red-alert/atlas.png`);
  if(!imageResponse.ok)throw Error('Red Alert texture is missing');
  const bitmap=await createImageBitmap(await imageResponse.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  let customSprites:Record<string,number[]>|undefined,customFrames:Frame[]=[];
  let customCanvas:HTMLCanvasElement|undefined;
  let barrierFacings:{wire:number[];fence:number[]}|undefined;
  // The original atlas is square, but the authored Soldat sheet is tall.
  // Keep the combined WebGPU texture under the portable 8192px default by
  // packing generated art beside the source atlas instead of beneath it.
  const customOffset=bitmap.width;
  let textureWidth=atlas.size,textureHeight=atlas.size;
  if(style==='soldat'){
    const custom=createSoldatAtlas();customCanvas=custom.canvas;customFrames=custom.frames;
  }
  // Bake 64 padded, nearest-neighbour facings from the verified RA panels.
  // Padding keeps diagonal corners intact; the game draws these frames upright.
  const facingSize=48,rows=(hasWireSprites?1:0)+(hasFenceSprites?1:0),extra=document.createElement('canvas');
  extra.width=Math.max(customCanvas?.width??0,facingSize*64);extra.height=(customCanvas?.height??0)+rows*facingSize;
  const extraContext=extra.getContext('2d')!;extraContext.imageSmoothingEnabled=false;if(customCanvas)extraContext.drawImage(customCanvas,0,0);
  let row=customCanvas?.height??0;
  const bake=(source:number[],target:'wire'|'fence')=>{const ids:number[]=[];const frame=atlas.frames[source[10]];for(let facing=0;facing<64;facing++){const x=facing*facingSize+facingSize/2,y=row+facingSize/2;extraContext.save();extraContext.translate(x,y);extraContext.rotate(facing*Math.PI/32);extraContext.drawImage(bitmap,frame.x,frame.y,frame.width,frame.height,-frame.width/2,-frame.height/2,frame.width,frame.height);extraContext.restore();ids.push(atlas.frames.length);atlas.frames.push({x:customOffset+facing*facingSize,y:row,width:facingSize,height:facingSize});}row+=facingSize;return ids;};
  barrierFacings={wire:hasWireSprites?bake(wireFrames,'wire'):[],fence:hasFenceSprites?bake(fenceFrames,'fence'):[]};
  if(customCanvas){const offset=atlas.frames.length;customSprites=Object.fromEntries(Object.entries(createSoldatAtlas().sprites).map(([kind,ids])=>[kind,ids.map(id=>id+offset)]));atlas.frames.push(...customFrames.map(frame=>({...frame,x:frame.x+customOffset})));}
  textureWidth=customOffset+extra.width;textureHeight=Math.max(textureHeight,extra.height);
  const texture=device.createTexture({label:'Original Red Alert sprite atlas',size:[textureWidth,textureHeight],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  device.queue.copyExternalImageToTexture({source:bitmap},{texture},[bitmap.width,bitmap.height]);bitmap.close();
  if(extra.height)device.queue.copyExternalImageToTexture({source:extra},{texture,origin:[customOffset,0]},[extra.width,extra.height]);
  const shader=device.createShaderModule({label:'Red Alert nearest-pixel sprites',code:`
struct Camera{viewport:vec4<f32>,world:vec4<f32>,time:vec4<f32>};
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var atlas:texture_2d<f32>;
struct Out{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>,@location(1) tint:vec4<f32>};
@vertex fn vs(@builtin(vertex_index) id:u32,@location(0) rect:vec4<f32>,@location(1) source:vec4<f32>,@location(2) tint:vec4<f32>,@location(3) angle:f32)->Out{
 let corners=array<vec2<f32>,6>(vec2f(0.,0.),vec2f(1.,0.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,0.),vec2f(1.,1.));let q=corners[id];let local=(q-.5)*rect.zw;let c=cos(angle);let s=sin(angle);let p=rect.xy+rect.zw*.5+vec2f(local.x*c-local.y*s,local.x*s+local.y*c);
 let aspect=camera.viewport.x/camera.viewport.y;let worldAspect=camera.world.z/camera.world.w;let scale=vec2(min(1.,worldAspect/aspect),min(1.,aspect/worldAspect));
 // A sprite's full footprint shares one depth: its lowest world-space edge.
 // Smaller depth is closer to the camera, matching the unit renderer.
 let ground=rect.y+rect.w;
 let depth=clamp(.95-(ground-camera.world.y)/camera.world.w*.8,.01,.99);
 var o:Out;o.pos=vec4((vec2(2.,-2.)*(p-camera.world.xy)/camera.world.zw+vec2(-1.,1.))*scale,depth,1.);
 o.uv=source.xy+q*source.zw;o.tint=tint;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4<f32>{let pixel=textureLoad(atlas,vec2<i32>(floor(i.uv)),0);if(pixel.a<.01){discard;}return pixel*i.tint;}`});
  const info=await shader.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>m.message).join('\n'));
  const bindLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}}]});
  const layout=device.createPipelineLayout({bindGroupLayouts:[bindLayout]});
  const vertex={arrayStride:52,stepMode:'instance' as const,attributes:[{shaderLocation:0,offset:0,format:'float32x4' as const},{shaderLocation:1,offset:16,format:'float32x4' as const},{shaderLocation:2,offset:32,format:'float32x4' as const},{shaderLocation:3,offset:48,format:'float32' as const}]};
  const pipeline=device.createRenderPipeline({label:'Red Alert sprites',layout,vertex:{module:shader,entryPoint:'vs',buffers:[vertex]},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  // Every tall object uses its ground-contact line as depth. This lets a unit
  // naturally pass in front of or behind a tree, wall, or turret by map Y.
  const depthPipeline=device.createRenderPipeline({label:'Ground-sorted Red Alert sprites',layout,vertex:{module:shader,entryPoint:'vs',buffers:[vertex]},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'}});
  // Defenses are elevated above wall faces. Draw them over the wall depth at
  // their location, then write their own depth so moving units still sort
  // naturally in front of or behind the turret.
  const defensePipeline=device.createRenderPipeline({label:'Elevated Red Alert defenses',layout,vertex:{module:shader,entryPoint:'vs',buffers:[vertex]},fragment:{module:shader,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'always'}});
  const bindings=device.createBindGroup({layout:bindLayout,entries:[{binding:0,resource:{buffer:camera}},{binding:1,resource:texture.createView()}]});
  const createBatch=(label:string)=>({buffer:device.createBuffer({label,size:52,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),capacity:1,count:0});
  const infantryBatch=createBatch('Original Red Alert infantry and kennels');
  const hasInfantrySprites=['e1','e3','e4','dog','dogbullt','kenn','tent'].every(name=>atlas.sprites[name]?.length);
  const terrain=createBatch('Facility floor'),walls=createBatch('Facility walls'),sceneryProps=createBatch('Landscape trees and buildings'),towers=createBatch('Original defense sprites'),mountedTowers=createBatch('Wall-mounted defense sprites'),wireBatch=createBatch('Connected Red Alert wire'),wireGhost=createBatch('Wire placement preview');
  const upload=(batch:ReturnType<typeof createBatch>,data:number[])=>{
    batch.count=data.length/13;if(batch.count>batch.capacity){batch.buffer.destroy();batch.capacity=2**Math.ceil(Math.log2(batch.count));batch.buffer=device.createBuffer({size:batch.capacity*52,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
    if(data.length)device.queue.writeBuffer(batch.buffer,0,new Float32Array(data));
  };
  function sprite(data:number[],id:number,x:number,y:number,width:number,height:number,tint=[1,1,1,1],crop?:Frame,angle=0){
    const f=crop??atlas.frames[id];data.push(x,y,width,height,f.x,f.y,f.width,f.height,...tint,angle);
  }
  let terrainKey='',barrierKey='',previousScenery:RenderScene['map']['scenery'],sceneryVersion=0;
  function prepare(scene:RenderScene){
    const friendly:number[]=[];
    if(hasInfantrySprites){
      for(const b of scene.infantry?.buildings??[]){
        if(b.kind!=='dog'&&(b.kind??'rifle')!=='rifle')continue;
        const id=atlas.sprites[b.kind==='dog'?'kenn':'tent'][0],f=atlas.frames[id];
        sprite(friendly,id,b.x-f.width/12,b.y+2-f.height/6,f.width/6,f.height/6);
      }
    }
    upload(infantryBatch,friendly);
    const scenery=scene.map.scenery,biome=scenery?.biome;
    if(previousScenery!==scenery){previousScenery=scenery;sceneryVersion++;}
    const landscapeAvailable=biome&&biome!=='interior'&&atlas.sprites[`${biome}:clear1`]?.length;
    const obstacles=scene.map.obstacles.filter(o=>!(scene.wires??[]).some(w=>!w.breached&&same(o,w))&&!(scene.fences??[]).some(f=>same(o,f))&&!((landscapeAvailable||biome==='interior')&&scenery?.solids.some(r=>same(r,o))));
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
        const firstFrame=Math.max(0,stamp.firstFrame??0);
        for(let i=0;i<Math.min(ids.length-firstFrame,stamp.columns*stamp.rows);i++)sprite(data,ids[firstFrame+i],stamp.x+(i%stamp.columns)*4,stamp.y+Math.floor(i/stamp.columns)*4,4,4);
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
    const freeform=scene.barrierSegments??[],wires=freeform.length?[]:scene.wires??[],fences=freeform.length?[]:scene.fences??[];
    const nextBarrierKey=JSON.stringify([wires.map(w=>[w.x,w.y,w.width,w.height,wireDamage(w)]),fences.map(f=>[f.x,f.y,f.width,f.height,wireDamage({...f,breached:false})]),freeform.map(barrier=>[barrier.from.x,barrier.from.y,barrier.to.x,barrier.to.y,barrier.run,barrier.kind,wireDamage({health:barrier.health,maxHealth:barrier.maxHealth,breached:barrier.breached??false})])]);
    if((hasWireSprites||hasFenceSprites)&&nextBarrierKey!==barrierKey){
      const data:number[]=[];
      if(hasWireSprites)for(const tile of wireTiles(wires)){
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
      if(hasFenceSprites){
        const fenceStates=fences.map(fence=>({...fence,breached:false}));
        for(const tile of wireTiles(fenceStates)){
          const id=fenceFrames[(tile.damage==='frayed'?16:0)+tile.mask],frame=atlas.frames[id],tint=tile.damage==='intact'?[1,1,1,1]:tile.damage==='worn'?[.88,.8,.68,1]:[.82,.72,.58,1];
          sprite(data,id,tile.x,tile.y,tile.width,tile.height,tint,{...frame,width:tile.width*6,height:tile.height*6});
        }
      }
      // Freeform paths retain the original RA horizontal panels.  Each stamp is
      // deliberately quantized to 64 facings so a direction never blurs into an
      // arbitrary GPU rotation, while still allowing a path to turn naturally.
      for(let index=0;index<freeform.length;){
        const first=freeform[index],run=first.run??index,kind=first.kind;let last=first,next=index+1;
        while(next<freeform.length&&next-index<6&&(freeform[next].run??next)===run&&freeform[next].kind===kind){last=freeform[next++];}
        const dx=last.to.x-first.from.x,dy=last.to.y-first.from.y,length=Math.hypot(dx,dy);
        if(length>.001){
          const facing=Math.round(Math.atan2(dy,dx)*32/Math.PI),angle=facing*Math.PI/32;
          const damaged=wireDamage({health:first.health,maxHealth:first.maxHealth,breached:first.breached??false}),frameId=(kind==='fence'?barrierFacings!.fence:barrierFacings!.wire)[(facing%64+64)%64];
          const tint=kind==='fence'?(damaged==='intact'?[1,1,1,1]:[.82,.72,.58,1]):damaged==='breached'?[.72,.65,.54,1]:damaged==='intact'?[1,1,1,1]:damaged==='worn'?[.88,.79,.65,1]:[.74,.61,.46,1];
          sprite(data,frameId,first.from.x-4,first.from.y-4,8,8,tint);
        }
        index=Math.max(index+1,next);
      }
      upload(wireBatch,data);barrierKey=nextBarrierKey;
    }
    const preview:number[]=[],ghosts=[...(scene.placementGhost?[scene.placementGhost]:[]),...(scene.placementGhosts??[])];
    const wireGhosts=ghosts.filter(ghost=>ghost.kind==='wire').map(ghost=>({...ghost,health:1,maxHealth:1,breached:false}));
    if(hasWireSprites&&wireGhosts.length){
      const ghostTiles=wireTiles(wireGhosts,[...wires,...wireGhosts]);
      for(const tile of ghostTiles){const id=wireFrames[tile.mask],frame=atlas.frames[id],ghost=wireGhosts.find(candidate=>tile.x>=candidate.x&&tile.x<candidate.x+candidate.width&&tile.y>=candidate.y&&tile.y<candidate.y+candidate.height)!;sprite(preview,id,tile.x,tile.y,tile.width,tile.height,ghost.valid?[.55,1,.7,.8]:[1,.3,.2,.8],{...frame,width:tile.width*6,height:tile.height*6});}
    }
    const fenceGhosts=ghosts.filter(ghost=>ghost.kind==='fence').map(ghost=>({...ghost,health:1,maxHealth:1,breached:false}));
    if(hasFenceSprites&&fenceGhosts.length){
      const fenceStates=fences.map(fence=>({...fence,breached:false})),ghostTiles=wireTiles(fenceGhosts,[...fenceStates,...fenceGhosts]);
      for(const tile of ghostTiles){const id=fenceFrames[tile.mask],frame=atlas.frames[id],ghost=fenceGhosts.find(candidate=>tile.x>=candidate.x&&tile.x<candidate.x+candidate.width&&tile.y>=candidate.y&&tile.y<candidate.y+candidate.height)!;sprite(preview,id,tile.x,tile.y,tile.width,tile.height,ghost.valid?[.55,1,.7,.8]:[1,.3,.2,.8],{...frame,width:tile.width*6,height:tile.height*6});}
    }
    upload(wireGhost,preview);
    const data:number[]=[],elevated:number[]=[];
    const draw=(target:number[],t:{kind:TowerKind;x:number;y:number;angle?:number;level?:number},tint?:number[])=>{
      if(customSprites&&!usesClassicDefenseSprite(t.kind)){
        sprite(target,customSprites[soldatSpriteKey(t.kind,t.level)][soldatFacing(t.angle??0)],t.x-SOLDAT_WORLD_SIZE/2,t.y-SOLDAT_WORLD_SIZE/2,SOLDAT_WORLD_SIZE,SOLDAT_WORLD_SIZE,tint);return;
      }
      const name=DEFENSES[t.kind];if(!name)return;
      const frameIndex=name==='gun'?redAlertFacing(t.angle??0):0,id=atlas.sprites[name][frameIndex],f=atlas.frames[id];
      // Six source pixels per world unit matches the 24-pixel/4-world-cell floor.
      // Tesla's original 48px canvas is anchored at its base, not its image center.
      sprite(target,id,t.x-f.width/12,t.y-f.height/12-(name==='tsla'?13/6:name==='ftur'?2/6:0),f.width/6,f.height/6,tint);
    };
    const isMounted=(t:{x:number;y:number})=>obstacles.some(rect=>t.x>=rect.x&&t.x<rect.x+rect.width&&t.y>=rect.y&&t.y<rect.y+rect.height);
    [...scene.towers].sort((a,b)=>a.y-b.y).forEach(t=>draw(isMounted(t)?elevated:data,t));
    if(scene.ghost)draw(isMounted(scene.ghost)?elevated:data,scene.ghost,scene.ghost.valid?[.7,1,.7,.65]:[1,.3,.3,.65]);
    upload(towers,data);upload(mountedTowers,elevated);
  }
  function draw(pass:GPURenderPassEncoder,batch:ReturnType<typeof createBatch>,groundSorted=false){if(!batch.count)return;pass.setPipeline(groundSorted?depthPipeline:pipeline);pass.setBindGroup(0,bindings);pass.setVertexBuffer(0,batch.buffer);pass.draw(6,batch.count);}
  function drawDefenses(pass:GPURenderPassEncoder){
    draw(pass,towers,true);
    if(!mountedTowers.count)return;pass.setPipeline(defensePipeline);pass.setBindGroup(0,bindings);pass.setVertexBuffer(0,mountedTowers.buffer);pass.draw(6,mountedTowers.count);
  }
  return {prepare,hasWireSprites,hasFenceSprites,hasInfantrySprites,drawInfantry:(pass:GPURenderPassEncoder)=>draw(pass,infantryBatch,true),drawFloor:(pass:GPURenderPassEncoder)=>draw(pass,terrain),drawWires:(pass:GPURenderPassEncoder)=>{draw(pass,wireBatch);draw(pass,wireGhost);},drawOccluders:(pass:GPURenderPassEncoder)=>{draw(pass,walls,true);draw(pass,sceneryProps,true);},drawTowers:drawDefenses,destroy(){infantryBatch.buffer.destroy();terrain.buffer.destroy();walls.buffer.destroy();sceneryProps.buffer.destroy();towers.buffer.destroy();mountedTowers.buffer.destroy();wireBatch.buffer.destroy();wireGhost.buffer.destroy();texture.destroy();}};
}

// Local asset conversion. EA artwork is separate from the game's source code.
// Binary format references: https://moddingwiki.shikadi.net/wiki/Westwood_MIX_Format
// https://moddingwiki.shikadi.net/wiki/Westwood_SHP_Format_(TD)
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createDecipheriv} from 'node:crypto';
import {inflateRawSync,deflateSync} from 'node:zlib';
import {resolve} from 'node:path';

const EXPECTED='aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c';
const archive=await readFile(process.argv[2]??'artifacts/red-alert/ra-base.zip');
if(createHash('sha1').update(archive).digest('hex')!==EXPECTED)throw Error('Not the verified OpenRA ra-base.zip package');
const output=resolve(process.argv[3]??'public/assets/red-alert');
await mkdir(output,{recursive:true});
function zipFile(name){
  for(let p=0;p<archive.length-46;p++)if(archive.readUInt32LE(p)===0x02014b50){
    const n=archive.readUInt16LE(p+28), filename=archive.toString('utf8',p+46,p+46+n);
    if(filename!==name)continue;
    const offset=archive.readUInt32LE(p+42),start=offset+30+archive.readUInt16LE(offset+26)+archive.readUInt16LE(offset+28);
    const data=archive.subarray(start,start+archive.readUInt32LE(p+20));
    const method=archive.readUInt16LE(p+10);
    if(method!==0&&method!==8)throw Error('Unsupported zip compression');
    return method===8?inflateRawSync(data):data;
  }
  throw Error(`Missing archive entry ${name}`);
}
function nameHash(name){
  const bytes=Buffer.from(name.toUpperCase()),padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);
  let hash=0;for(let p=0;p<padded.length;p+=4)hash=(((hash<<1)|(hash>>>31))+padded.readUInt32LE(p))>>>0;
  return hash;
}
function mixIndex(mix){
  let start=mix.readUInt16LE(0)?0:4,header=mix,base;
  if(start&&(mix.readUInt32LE(0)&0x20000)){
    // MIX's embedded public RSA modulus unwraps two little-endian key blocks.
    const modulus=BigInt('0x'+Buffer.from('AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V','base64').subarray(2).toString('hex'));
    const key=Buffer.alloc(78);
    for(let block=0;block<2;block++){
      let value=BigInt('0x'+Buffer.from(mix.subarray(4+block*40,44+block*40)).reverse().toString('hex')),power=65537n,result=1n;
      while(power){if(power&1n)result=result*value%modulus;value=value*value%modulus;power>>=1n;}
      for(let i=0;i<39;i++){key[block*39+i]=Number(result&255n);result>>=8n;}
    }
    const decrypt=length=>{const cipher=createDecipheriv('bf-ecb',key.subarray(0,56),null);cipher.setAutoPadding(false);return Buffer.concat([cipher.update(mix.subarray(84,84+length)),cipher.final()]);};
    const count=decrypt(8).readUInt16LE(0),length=Math.ceil((6+count*12)/8)*8;
    header=decrypt(length);start=0;base=84+length;
  }
  const count=header.readUInt16LE(start);base??=start+6+count*12;
  const entries=new Map();for(let i=0;i<count;i++){const p=start+6+i*12;entries.set(header.readUInt32LE(p),mix.subarray(base+header.readUInt32LE(p+4),base+header.readUInt32LE(p+4)+header.readUInt32LE(p+8)));}
  return entries;
}
const packages=['interior.mix','conquer.mix','local.mix','temperat.mix','snow.mix'].map(name=>mixIndex(zipFile(name)));
function asset(name){
  for(const mix of packages){
    const file=mix.get(nameHash(name));if(file)return file;
  }
  throw Error(`Missing asset ${name}`);
}
function tiles(data){
  const width=data.readUInt16LE(0),height=data.readUInt16LE(2),start=data.readUInt32LE(16),index=data.readUInt32LE(36),end=data.readUInt32LE(28);
  return Array.from(data.subarray(index,end),slot=>({width,height,pixels:slot===255?Buffer.alloc(width*height):data.subarray(start+slot*width*height,start+(slot+1)*width*height)}));
}
function shp(data){
  const count=data.readUInt16LE(0),width=data.readUInt16LE(6),height=data.readUInt16LE(8),frames=[];
  const offsets=Array.from({length:count},(_,i)=>data.readUInt32LE(14+i*8)&0xffffff);
  function frame(i,stack=new Set()){
    if(frames[i])return frames[i];
    if(i<0||i>=count||stack.has(i))throw Error('Invalid SHP reference');stack.add(i);
    const format=data[17+i*8];let p=offsets[i],q=0;
    const pixels=format===128?Buffer.alloc(width*height):Buffer.from(frame(format===32?i-1:offsets.indexOf(data.readUInt16LE(18+i*8)),stack).pixels);
    const byte=()=>{if(p>=data.length)throw Error('Truncated SHP');return data[p++];};
    const word=()=>byte()|(byte()<<8);
    const put=v=>{if(q>=pixels.length)throw Error('SHP overflow');pixels[q++]=v;};
    if(format===128){
      for(;;){const op=byte();if(op===128)break;
        if(op<128){const n=(op>>4)+3,distance=((op&15)<<8)|byte();for(let j=0;j<n;j++)put(pixels[q-distance]);}
        else if(op<192){for(let j=0;j<(op&63);j++)put(byte());}
        else if(op===254){const n=word(),value=byte();for(let j=0;j<n;j++)put(value);}
        else{const n=op===255?word():(op&63)+3;let source=word();for(let j=0;j<n;j++)put(pixels[source++]);}
      }
    }else if(format===32||format===64){
      for(;;){const op=byte();let n=op&127;
        if(op===128){const command=word();if(!command)break;n=command&0x3fff;
          if(command<32768){q+=command;continue;}
          if(command&16384){const value=byte();for(let j=0;j<n;j++)put(pixels[q]^value);}
          else for(let j=0;j<n;j++)put(pixels[q]^byte());
        }else if(op>128)q+=n;
        else if(op===0){n=byte();const value=byte();for(let j=0;j<n;j++)put(pixels[q]^value);}
        else for(let j=0;j<n;j++)put(pixels[q]^byte());
        if(q>pixels.length)throw Error('SHP delta overflow');
      }
    }else throw Error(`Unknown SHP format ${format}`);
    return frames[i]={width,height,pixels};
  }
  return Array.from({length:count},(_,i)=>frame(i));
}
const palette=asset('interior.pal');
const sprites={},images=[];
function add(name,frames,colors=palette){sprites[name]=frames.map((frame,index)=>{const id=images.length;images.push({...frame,name,index,colors});return id;});}
add('floor',tiles(asset('flor0001.int')));
for(let i=1;i<=49;i++)add(`wall${i}`,tiles(asset(`wall${String(i).padStart(4,'0')}.int`)));
for(const name of ['gun','tsla','ftur','sam','fenc','barb'])add(name,shp(asset(`${name}.shp`)));
add('grating',tiles(asset('gflr0001.int')));
for(const name of ['strp0001','strp0002','gstr0001','gstr0002','arro0001','arro0002'])add(name,tiles(asset(`${name}.int`)));
for(const index of [1,3,5,7,9,10,11]){const name=`xtra${String(index).padStart(4,'0')}`;add(name,tiles(asset(`${name}.int`)));}
for(let i=1;i<=9;i++){const name=`boxes${String(i).padStart(2,'0')}`;add(`interior:${name}`,shp(asset(`${name}.int`)).slice(0,1));}
for(const name of ['barl','brl3'])add(`interior:${name}`,shp(asset(`${name}.shp`)).slice(0,1));
const templates=JSON.parse(await readFile(new URL('./red-alert-terrain.json',import.meta.url),'utf8'));
for(const [biome,extension,pal] of [['forest','tem','temperat.pal'],['winter','sno','snow.pal']]){
  const colors=asset(pal);
  for(const name of Object.keys(templates))add(`${biome}:${name}`,tiles(asset(`${name}.${extension}`)),colors);
  for(const name of ['t01','t02','t03','t05','t06','t07','t08','t10','t11','t12','t13','t14','t15','t16','t17','tc01','tc02','tc03','tc04','tc05','v01','v02','v03','v04','v05','v06','v07','v08','v09','v10','v11'])add(`${biome}:${name}`,shp(asset(`${name}.${extension}`)).slice(0,1),colors);
}
// Every frame retains its original canvas and pivot; transparent margins matter.
const size=2048,rgba=Buffer.alloc(size*size*4);let x=0,y=0,row=0;
const frames=images.map(im=>{
  if(x+im.width+2>size){x=0;y+=row+2;row=0;}if(y+im.height+2>size)throw Error('Atlas overflow');
  const entry={x:x+1,y:y+1,width:im.width,height:im.height};
  for(let py=0;py<im.height;py++)for(let px=0;px<im.width;px++){
    const index=im.pixels[py*im.width+px],at=((entry.y+py)*size+entry.x+px)*4;
    // Palette index 4 is the original translucent shadow; index 0 is transparent.
    for(let channel=0;channel<3;channel++)rgba[at+channel]=index===4?0:im.colors[index*3+channel]*4;
    rgba[at+3]=index===0?0:index===4?128:255;
  }
  x+=im.width+2;row=Math.max(row,im.height);return entry;
});
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),body=Buffer.concat([tag,data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc(body),out.length-4);return out;}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const scanlines=Buffer.alloc(size*(size*4+1));for(let row=0;row<size;row++)rgba.copy(scanlines,row*(size*4+1)+1,row*size*4,(row+1)*size*4);
await writeFile(resolve(output,'atlas.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]));
await writeFile(resolve(output,'atlas.json'),JSON.stringify({size,frames,sprites,source:{package:'OpenRA ra-base.zip',sha1:EXPECTED,palette:'interior.pal',copyright:'Original Red Alert artwork © Electronic Arts. Not covered by OpenRA GPL.',notice:'https://www.openra.net/legal/'}},null,2)+'\n');
console.log(`Imported ${frames.length} original frames to ${output}`);

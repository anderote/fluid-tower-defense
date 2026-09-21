// Imports a focused set of original Red Alert combat effects from OpenRA's
// checksum-verified base package. The game assets are separate from this source.
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const run=promisify(execFile);
const expected='aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c';
const source=resolve(process.argv[2]??'artifacts/red-alert/ra-base.zip');
const output=resolve(process.argv[3]??'public/audio/openra');
const sounds={
  'rifle-fire':'gun11.aud', 'rocket-fire':'missile1.aud', 'rocket-impact':'kaboom25.aud',
  'flame-impact':'firebl3.aud', 'autocannon-fire':'gun13.aud', 'mortar-fire':'tank5.aud',
  'tesla-fire':'tesla1.aud', 'cannon-fire':'turret1.aud', 'heavy-impact':'kaboom15.aud'
};
const hash=name=>{const bytes=Buffer.from(name.toUpperCase()),padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);let value=0;for(let i=0;i<padded.length;i+=4)value=(((value<<1)|(value>>>31))+padded.readUInt32LE(i))>>>0;return value;};
function mixEntries(data){
  const start=data.readUInt16LE(0)?0:4,count=data.readUInt16LE(start),base=start+6+count*12,entries=new Map();
  for(let i=0;i<count;i++){const at=start+6+i*12;entries.set(data.readUInt32LE(at),data.subarray(base+data.readUInt32LE(at+4),base+data.readUInt32LE(at+4)+data.readUInt32LE(at+8)));}
  return entries;
}
const temp=await mkdtemp(resolve(tmpdir(),'pressure-front-openra-'));
try{
  const archive=await readFile(source);
  if(createHash('sha1').update(archive).digest('hex')!==expected)throw Error('Not the verified OpenRA ra-base.zip package');
  await run('unzip',['-qq',source,'sounds.mix','-d',temp]);
  const entries=mixEntries(await readFile(resolve(temp,'sounds.mix')));
  await mkdir(output,{recursive:true});
  for(const [target,name] of Object.entries(sounds)){
    const input=resolve(temp,name),wav=resolve(output,`${target}.wav`),data=entries.get(hash(name));
    if(!data)throw Error(`Missing ${name} in sounds.mix`);
    await writeFile(input,data);
    await run('ffmpeg',['-y','-v','error','-f','wsaud','-i',input,wav]);
  }
  console.log(`Imported ${Object.keys(sounds).length} OpenRA combat effects to ${output}`);
}finally{await rm(temp,{recursive:true,force:true});}

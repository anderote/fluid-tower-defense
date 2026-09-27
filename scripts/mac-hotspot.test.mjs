import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=await readFile(new URL('./mac-hotspot.sh',import.meta.url),'utf8');
async function fixture(initial,run){
 const dir=await mkdtemp(join(tmpdir(),'hotspot-test-')),state=join(dir,'state.json');
 await writeFile(state,JSON.stringify({exists:false,device:'lo0',enabled:false,sharing:0,aliases:['127.0.0.1','127.0.0.2'],calls:[],...initial}));
 const tool=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),name=path.basename(process.argv[1]),args=process.argv.slice(2),file=process.env.HOTSPOT_TEST_STATE,s=JSON.parse(fs.readFileSync(file));
const save=()=>fs.writeFileSync(file,JSON.stringify(s));const fail=()=>{save();process.exit(1);};
if(name==='uname'){console.log('Darwin');process.exit();}
if(name==='PlistBuddy'){console.log(s.sharing);process.exit();}
if(name==='networksetup'){
 const [action,service,value]=args;
 if(action==='-listallnetworkservices'){console.log('An asterisk (*) denotes that a network service is disabled.\\nWi-Fi'+(s.exists?'\\n'+(s.enabled?'':'*')+'Plane Co-op Local':''));process.exit();}
 if(action==='-listnetworkserviceorder'){console.log('(1) Wi-Fi\\n(Hardware Port: Wi-Fi, Device: en0)'+(s.exists?'\\n(2) Plane Co-op Local\\n(Hardware Port: loopback, Device: '+s.device+')':''));process.exit();}
 if(action==='-getinfo'){console.log('IP address: '+(s.ip||'none'));process.exit();}
 s.calls.push(args);
 if(action==='-createnetworkservice'){s.exists=true;s.device='lo0';}
 else if(action==='-setmanual'){s.ip=value;s.aliases=s.aliases.filter(a=>a!=='127.0.0.1');if(!s.aliases.includes(value))s.aliases.push(value);if(s.failManual)fail();}
 else if(action==='-setnetworkserviceenabled')s.enabled=value==='on';
 else if(action==='-setv4off'){s.ip=null;s.aliases=s.aliases.filter(a=>a!=='10.10.10.1');}
 else fail();save();process.exit();
}
if(name==='ifconfig'){
 if(args.length===1){console.log(s.aliases.map(a=>' inet '+a+' netmask 0xff000000').join('\\n'));process.exit();}
 s.calls.push(args);if(args[1]==='alias'){if(!s.aliases.includes(args[2]))s.aliases.push(args[2]);}else if(args[1]==='-alias')s.aliases=s.aliases.filter(a=>a!==args[2]);else fail();save();process.exit();
}
fail();
`;
 for(const name of ['uname','networksetup','PlistBuddy','ifconfig']){const p=join(dir,name);await writeFile(p,tool);await chmod(p,0o700);}
 await writeFile(join(dir,'nat'),'fixture');
 // Rewrite only a temporary copy: every mutating system command is mocked.
 let copy=source.replace('if (( EUID != 0 )); then','if false; then').replace("NAT='/Library/Preferences/SystemConfiguration/com.apple.nat.plist'",`NAT='${join(dir,'nat')}'`);
 for(const [binary,name]of [['/usr/bin/uname','uname'],['/usr/sbin/networksetup','networksetup'],['/usr/libexec/PlistBuddy','PlistBuddy'],['/sbin/ifconfig','ifconfig']])copy=copy.replaceAll(binary,`'${join(dir,name)}'`);
 const script=join(dir,'helper.sh');await writeFile(script,copy);
 try{await run(mode=>spawnSync('/bin/bash',[script,mode],{encoding:'utf8',env:{...process.env,HOTSPOT_TEST_STATE:state}}),async()=>JSON.parse(await readFile(state,'utf8')));}finally{await rm(dir,{recursive:true,force:true});}
}
test('preparation restores localhost after Tahoe replaces it and can be repeated',()=>fixture({},async(run,state)=>{
 assert.equal(run('prepare').status,0);let s=await state();assert.ok(s.enabled);assert.ok(s.aliases.includes('127.0.0.1'));assert.ok(s.aliases.includes('127.0.0.2'));assert.ok(s.aliases.includes('10.10.10.1'));assert.equal(s.sharing,0);
 assert.equal(run('prepare').status,0);s=await state();assert.equal(s.calls.filter(c=>c[0]==='-createnetworkservice').length,1);
}));
test('failed preparation still restores localhost',()=>fixture({failManual:true},async(run,state)=>{
 assert.notEqual(run('prepare').status,0);assert.ok((await state()).aliases.includes('127.0.0.1'));
}));
test('undo disables only our service, removes only its alias, and is repeatable',()=>fixture({exists:true,enabled:true,ip:'10.10.10.1',aliases:['10.10.10.1','127.0.0.1','127.0.0.2']},async(run,state)=>{
 assert.equal(run('undo').status,0);assert.equal(run('undo').status,0);const s=await state();assert.equal(s.enabled,false);assert.deepEqual(s.aliases,['127.0.0.1','127.0.0.2']);assert.equal(s.sharing,0);
 assert.ok(s.calls.filter(c=>c[0].startsWith('-set')).every(c=>c[1]==='Plane Co-op Local'));
}));
test('active sharing and an unrelated same-named service block mutation',async()=>{
 for(const initial of [{sharing:1},{exists:true,device:'en0'}])await fixture(initial,async(run,state)=>{
  assert.notEqual(run('prepare').status,0);assert.notEqual(run('undo').status,0);assert.deepEqual((await state()).calls,[]);
 });
});
test('status and unknown commands cannot mutate settings',()=>fixture({},async(run,state)=>{
 assert.equal(run('status').status,0);assert.notEqual(run('oops').status,0);assert.deepEqual((await state()).calls,[]);
}));

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile, copyFile, mkdtemp, rm, symlink, rename} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir,tmpdir} from 'node:os';

const source=dirname(fileURLToPath(import.meta.url));
const home=join(homedir(),'Library/Application Support/Pressure Front');
const label='local.pressure-front.game';
const plist=join(homedir(),'Library/LaunchAgents',`${label}.plist`);
const domain=`gui/${process.getuid()}`;
const run=(bin,args,options={})=>execFileSync(bin,args,{stdio:'inherit',...options});
const capture=(bin,args)=>execFileSync(bin,args,{encoding:'utf8'}).trim();
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const command=process.argv[2]??'status';

async function publish(repo){
  // Build the committed main snapshot, never the caller's checked-out files.
  const commit=capture('git',['-C',repo,'rev-parse','main^{commit}']);
  const release=`${commit.slice(0,12)}-${Date.now()}`;
  const temp=await mkdtemp(join(tmpdir(),'pressure-front-release-'));
  try{
    const archive=join(temp,'source.tar'),build=join(temp,'source');
    await mkdir(build);
    run('git',['-C',repo,'archive','--format=tar',`--output=${archive}`,commit]);
    run('tar',['-xf',archive,'-C',build]);
    // npm ci respects the snapshot lockfile, independently of worktree installs.
    run('npm',['ci','--prefer-offline','--no-audit','--no-fund'],{cwd:build});
    run('npm',['test'],{cwd:build});
    run('npm',['run','build','--','--base',`/releases/${release}/`],{cwd:build});
    await writeFile(join(build,'dist/release.json'),JSON.stringify({commit,release,publishedAt:new Date().toISOString()},null,2));
    const destination=join(home,'releases',release);
    await mkdir(dirname(destination),{recursive:true});
    // temp and home may reside on different volumes.
    run('cp',['-R',join(build,'dist'),destination]);
    const next=join(home,`current-${release}`);
    await symlink(join('releases',release),next);
    await rename(next,join(home,'current'));
    console.log(`Published main ${commit.slice(0,12)}. Refresh http://127.0.0.1:5173 when ready.`);
  }finally{await rm(temp,{recursive:true,force:true});}
}

if(command==='install'){
  if(process.platform!=='darwin')throw new Error('The background service installer requires macOS.');
  const repo=capture('git',['-C',resolve(source,'..'),'rev-parse','--git-common-dir']);
  const repository=resolve(source,'..',repo,'..');
  await mkdir(home,{recursive:true});
  await writeFile(join(home,'config.json'),JSON.stringify({repository}));
  for(const file of ['stable-local.mjs','stable-server.mjs'])await copyFile(join(source,file),join(home,file));
  const bin=join(homedir(),'.local/bin');await mkdir(bin,{recursive:true});
  await writeFile(join(bin,'pressure-front'),`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(home,'stable-local.mjs'))} "$@"\n`,{mode:0o755});
  await mkdir(dirname(plist),{recursive:true});
  await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[process.execPath,join(home,'stable-server.mjs'),home,'5173'].map(value=>`<string>${xml(value)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(home)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(join(home,'server.log'))}</string><key>StandardErrorPath</key><string>${xml(join(home,'server-error.log'))}</string></dict></plist>`);
  console.log('Installed pressure-front. Run pressure-front update, then pressure-front start.');
}else if(command==='update'){
  const {repository}=JSON.parse(await readFile(join(home,'config.json'),'utf8'));
  await publish(repository);
}else if(command==='start'){
  if(!existsSync(join(home,'current/index.html')))throw new Error('Run pressure-front update first.');
  try{execFileSync('launchctl',['print',`${domain}/${label}`],{stdio:'ignore'});console.log('Already running.');}
  catch{run('launchctl',['bootstrap',domain,plist]);console.log('Started http://127.0.0.1:5173');}
}else if(command==='stop'){
  run('launchctl',['bootout',`${domain}/${label}`]);
}else if(command==='status'){
  console.log(await readFile(join(home,'current/release.json'),'utf8'));
  run('launchctl',['print',`${domain}/${label}`]);
}else throw new Error('Usage: pressure-front [update|start|stop|status]');

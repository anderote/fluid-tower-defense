import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGameServer} from '../../scripts/stable-server.mjs';

test('published snapshots swap without restarting and old assets remain available',async()=>{
  const home=await mkdtemp(join(tmpdir(),'pressure-front-server-test-'));
  const server=createGameServer(home);
  try{
    for(const version of ['one','two']){
      const release=join(home,'releases',version);
      await mkdir(release,{recursive:true});
      await writeFile(join(release,'index.html'),version);
      await writeFile(join(release,'track.wav'),'0123456789');
      await writeFile(join(release,'release.json'),JSON.stringify({release:version}));
    }
    await writeFile(join(home,'config.json'),'private server configuration');
    await symlink('releases/one',join(home,'current'));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(base)).text(),'one');
    await symlink('releases/two',join(home,'next'));
    await rename(join(home,'next'),join(home,'current'));
    assert.equal(await (await fetch(base)).text(),'two');
    assert.equal(await (await fetch(base+'/releases/one/index.html')).text(),'one');
    assert.deepEqual(await (await fetch(base+'/__release')).json(),{release:'two'});
    const range=await fetch(base+'/track.wav',{headers:{Range:'bytes=2-5'}});
    assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 2-5/10');
    assert.equal(await range.text(),'2345');
    assert.equal((await fetch(base+'/track.wav',{headers:{Range:'bytes=20-'}})).status,416);
    assert.equal(await (await fetch(base+'/track.wav',{method:'HEAD'})).text(),'');
    assert.equal((await fetch(base+'/missing.js')).status,404);
    assert.equal((await fetch(base+'/releases/..%2fconfig.json')).status,403);
    assert.equal((await fetch(base,{method:'POST'})).status,405);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await rm(home,{recursive:true,force:true});
  }
});

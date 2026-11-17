const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const vm=require('node:vm');
const {buildSync}=require('esbuild');

test('overlay sliders coalesce queued changes and current titles precede speculative warming',async()=>{
  const entry=path.resolve(__dirname,'../src/editor/video/gpu/overlay-worker-client.ts');
  const code=buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,
    define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)}}).outputFiles[0].text;
  const workers=[];
  class Worker{
    sent=[];
    constructor(){workers.push(this);}
    postMessage(message){this.sent.push(message);}
    finish(index){const message=this.sent[index];this.onmessage({data:{id:message.id,
      bitmap:{width:8,height:4,close(){}}}});}
    terminate(){}
  }
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Worker,URL,DOMException,console,
    document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})},
    createImageBitmap:async source=>({width:source.width,height:source.height,close(){}}),
  });
  const client=new module.exports.OverlayWorkerClient();
  const source={width:8,height:4},context={timestamp:0,sourceTime:0,frameIndex:0,fps:60};
  const observe=promise=>promise.then(()=>({ok:true}),error=>({ok:false,name:error.name}));
  const first=observe(client.render(source,[],context,undefined,'warm-first',false));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(workers[0].sent.length,1);
  const sliders=Array.from({length:20},(_,amount)=>observe(client.render(source,
    [{kind:'outline',enabled:true,amount}],context,undefined,'current-title',true)));
  const warm1=observe(client.render(source,[],context,undefined,'warm-next',false));
  const warm2=observe(client.render(source,[],context,undefined,'warm-later',false));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(workers[0].sent.length,1,'one worker operation runs at a time');
  workers[0].finish(0);
  assert.equal(workers[0].sent[1].effects[0].amount,19,'only the newest slider value is dispatched next');
  workers[0].finish(1);
  client.close();
  assert.deepEqual(await first,{ok:true});
  const results=await Promise.all(sliders);
  assert.ok(results.slice(0,-1).every(result=>!result.ok&&result.name==='AbortError'));
  assert.ok(results.at(-1).ok);
  assert.equal((await warm1).name,'AbortError');assert.equal((await warm2).name,'AbortError');
});

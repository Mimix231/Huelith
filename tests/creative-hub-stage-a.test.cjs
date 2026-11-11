const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const projectRoot = path.resolve(__dirname, '..');
function hub() {
  const local = new Map(); const events = [];
  const js = ts.transpileModule(fs.readFileSync(path.join(projectRoot,'src/editor/project-hub.ts'),'utf8'),{
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 },fileName:'project-hub.ts' }).outputText;
  const exports = {};
  const ctx = { exports, crypto:{ randomUUID:()=> 'v-123' }, Date, console,
    localStorage:{ getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)},
    window:{dispatchEvent:e=>events.push(e.type)}, Event:class { constructor(type){this.type=type;} },
    require:id=>{if(id==='./types')return {isDocument:value=>value?.format==='huelith' && Array.isArray(value.layers)};
      if(id==='./video/timeline')return {isVideoTimeline:value=>value && Array.isArray(value.assets) && Array.isArray(value.tracks) && Array.isArray(value.clips)};
      throw new Error(id);},
  };
  vm.runInNewContext(js,ctx,{filename:'project-hub.js'});
  return {api:exports,local,ctx,events};
}
const image = id=>({format:'huelith',version:1,id,name:'Artwork '+id,width:800,height:600,layers:[],createdAt:'2026-11-02',updatedAt:'2026-11-02'});
test('fresh Hub returns empty recents and tolerates malformed metadata',()=>{
  const {api,local}=hub();assert.equal(api.readRecentProjects().length,0);
  local.set('huelith-hub-recent-v1','{invalid');assert.equal(api.readRecentProjects().length,0);
});
test('desktop project identities deduplicate across saved revision and path casing',async()=>{
  const {api,events}=hub();await api.recordRecentProject(image('a'),'C:\\MyArt\\one.huelith');
  await api.recordRecentProject(image('b'),'c:/myart/one.huelith');
  assert.equal(api.readRecentProjects().length,1);
  assert.equal(api.readRecentProjects()[0].name,'Artwork b');
  assert.ok(events.includes(api.RECENTS_CHANGED));
});
test('Hub never stores an unsaved web project unless a snapshot exists',async()=>{
  const {api}=hub();await api.recordRecentProject(image('x'));
  assert.equal(api.readRecentProjects()[0].snapshot,false);
  assert.equal(api.readRecentProjects()[0].kind,'image');
});
test('video project has versioned schema and validation prevents malformed data',()=>{
  const {api}=hub();const good=api.newVideoProject('Clip',1920,1080,30);
  assert.equal(api.isVideoProject(good),true);assert.equal(good.format,'huelith-video');
  assert.equal(api.isVideoProject({...good,fps:0}),false);
  assert.equal(api.isVideoProject({...good,width:200000}),false);
  assert.equal(api.isVideoProject({...good,version:2}),false);
  assert.equal(api.isVideoProject({...good,format:'huelith'}),false);
});
test('recent project metadata includes dimensions, fps, sorted recent and removal',async()=>{
  const {api}=hub();const anim={...image('anim'),animation:{fps:24}};
  const video=api.newVideoProject('A clip',1920,1080,30);
  await api.recordRecentProject(anim,'a.huelith');await api.recordRecentProject(video,'b.huelith');
  assert.equal(api.readRecentProjects().length,2);
  assert.equal(api.readRecentProjects()[0].kind,'video');
  assert.equal(api.readRecentProjects()[1].fps,24);
  api.touchRecentProject('path:a.huelith');assert.equal(api.readRecentProjects()[0].kind,'animation');
  api.removeRecentProject('path:a.huelith');assert.equal(api.readRecentProjects().length,1);
});
test('Stage A wiring preserves existing renderers and makes project types explicit',()=>{
  const src=fs.readFileSync(path.join(projectRoot,'src/App.tsx'),'utf8');
  assert.match(src,/onCreate=\{startNew\}/);assert.match(src,/onOpenRecent=\{entry/);
  assert.match(src,/videoProject \? <VideoWorkspace/);assert.match(src,/!newVideo &&/);
  assert.match(src,/<Canvas onError=\{handleError\}/);
  const file=fs.readFileSync(path.join(projectRoot,'src/editor/files.ts'),'utf8');
  assert.match(file,/migrateLegacyEffects/);assert.match(file,/openCreativeProject/);
});

test('web IndexedDB snapshot records and reopens complete project data',async()=>{
  const {api,ctx}=hub();const data=new Map();let created=false;
  const db={
    objectStoreNames:{contains:()=>created},createObjectStore:()=>{created=true;},close:()=>{},
    transaction:(_name,mode)=>{
      const tx={oncomplete:null,onerror:null,onabort:null,objectStore:()=>({
        put:(value,id)=>{data.set(id, structuredClone(value));setTimeout(()=>tx.oncomplete?.(),0);},
        get:(id)=>{const req={onsuccess:null,onerror:null,result:undefined};setTimeout(()=>{req.result=data.get(id);req.onsuccess?.();},0);return req;},
        delete:(id)=>{data.delete(id);setTimeout(()=>tx.oncomplete?.(),0);},
      })};return tx;
    },
  };
  ctx.indexedDB={open:()=>{const request={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
    setTimeout(()=>{if(!created)request.onupgradeneeded?.();request.onsuccess?.();},0);return request;}};
  const doc=image('persisted');doc.layers=[{id:'l1',type:'raster',image:'data:image/png;base64,AAA'}];
  await api.recordRecentProject(doc);
  const recent=api.readRecentProjects();
  assert.equal(recent.length,1);assert.equal(recent[0].snapshot,true);
  const restored=await api.readRecentSnapshot(recent[0].id);
  assert.equal(restored.name,doc.name);assert.equal(restored.layers[0].id,'l1');
  api.removeRecentProject(recent[0].id);
  await new Promise(resolve=>setTimeout(resolve,12));
  assert.equal(data.size,0);
});

test('more than 24 recent projects keeps bounded metadata list',async()=>{
  const {api}=hub();
  for(let i=0;i<27;i++)await api.recordRecentProject(image('item-'+i),'/home/art/'+i+'.huelith');
  assert.equal(api.readRecentProjects().length,24);
  assert.equal(api.readRecentProjects()[0].name,'Artwork item-26');
  assert.equal(api.readRecentProjects().some(p=>p.name==='Artwork item-0'),false);
});

test('unsaved Stage A video projects participate in the native close guard',()=>{
  const source=fs.readFileSync(path.join(projectRoot,'src/components/WindowControls.tsx'),'utf8');
  assert.match(source,/tabs\.filter\(tab => tab\.dirty\)\.length \+ \(extraDirty \? 1 : 0\)/);
  assert.match(source,/await onSaveExtra\(\)/);
  const app=fs.readFileSync(path.join(projectRoot,'src/App.tsx'),'utf8');
  assert.match(app,/extraDirty=\{Boolean\(videoProject && !videoSaved\)\}/);
  assert.match(app,/beforeunload/);
});

test('web recent identity survives the editor assigning a new tab ID',async()=>{
  const {api}=hub();
  const source=image('source');
  api.bindOpenedDocumentRecentId('working-tab-123',api.recentId(source));
  const working={...source,id:'working-tab-123',name:'Edited and saved'};
  assert.equal(api.recentId(working),api.recentId(source));
  await api.recordRecentProject(source);
  await api.recordRecentProject(working);
  assert.equal(api.readRecentProjects().length,1);
  assert.equal(api.readRecentProjects()[0].name,'Edited and saved');
});

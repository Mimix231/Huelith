const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/components/VideoEditorExportOverlay.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function bootstrap(selectedPath,options={}){
 let hook=0;const slots=[];const refs=[];let preflights=0,saves=0,queues=0,cancels=0;
 const renderNode=(type,props,key)=>({type,props:props??{},key});
 const react={useState(initial){const i=hook++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
   return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}]},
  useRef(initial){const i=hook++;if(!(i in refs))refs[i]={current:initial};return refs[i]},
  useEffect(){},useMemo(fn){hook++;return fn()}};
 const fakeComponent=()=>null;
 const jsruntime={jsx:renderNode,jsxs:renderNode};
 const dependencies={
  react:{...react,default:react},'react/jsx-runtime':jsruntime,
  '@mui/material':{Dialog:fakeComponent},'@mui/icons-material':new Proxy({}, {get:()=>fakeComponent}),
  'motion/react':{motion:new Proxy({}, {get:(_,tag)=>tag}),useReducedMotion:()=>false},
  '../editor/video/export-display':{readRenderInsights:()=>({stage:'preparing',label:'Preparing the project',fps:null,eta:null,completed:null,total:null})},
  '@tauri-apps/plugin-dialog':{save:async()=>{saves++;return selectedPath;}},
  '@tauri-apps/api/core':{invoke:async()=>{}},
  '../editor/video/native-media':{isNativeMediaDesktop:()=>true},
  '../editor/video/timeline':{durationOf:()=>20},
  '../editor/video/hybrid-timeline-export':{selectVideoExportBackend:()=>{preflights++;if(options.preflightError)throw Error(options.preflightError);return {backend:'native'};}},
  './VideoPreviewCanvas':{__esModule:true,default:fakeComponent},
  './VideoEditorExportOverlay.css':{},'./VideoRound7Polish.css':{},
 };
 const exports={};new Function('module','exports','require',compiled)({exports},exports,p=>{
   if(!(p in dependencies))throw Error('Missing test stub '+p);return dependencies[p];
 });
 const Overlay=exports.default;
 const props={open:true,name:'My cool video',width:1920,height:1080,fps:60,
  timeline:{tracks:[],clips:[],assets:[]},recent:[],jobs:[],onClose(){},
  onQueue(requests){queues++;return 'job-123';},onCancel(id){assert.equal(id,'job-123');cancels++;}};
 function render(){hook=0;return Overlay(props);}
 function walk(node,predicate,results=[]){if(Array.isArray(node)){node.forEach(n=>walk(n,predicate,results));return results;}
  if(!node||typeof node!=='object')return results;if(predicate(node))results.push(node);
  walk(node.props?.children,predicate,results);return results;}
 function button(node,label){return walk(node,n=>n.type==='button'&&JSON.stringify(n.props.children).includes(label))[0];}
 return {render,button,props,stats:()=>({preflights,saves,queues,cancels})};
}
async function flush(){await new Promise(resolve=>setTimeout(resolve,0));}
test('closing Save As returns to settings and does NOT create a render job',async()=>{
 const ctx=bootstrap(null);let ui=ctx.render();await ctx.button(ui,'Render').props.onClick();await flush();
 assert.deepEqual(ctx.stats(),{preflights:1,saves:1,queues:0,cancels:0});
 ui=ctx.render();assert.ok(ctx.button(ui,'Render'));assert.ok(!ctx.button(ui,'Cancel render'));
});
test('successful Save As queues native export then Cancel render stays inside settings',async()=>{
 const ctx=bootstrap('E:\\Videos\\edited.mp4');let ui=ctx.render();await ctx.button(ui,'Render').props.onClick();await flush();
 assert.deepEqual(ctx.stats(),{preflights:1,saves:1,queues:1,cancels:0});
 ui=ctx.render();assert.ok(ctx.button(ui,'Cancel render'));
 ctx.button(ui,'Cancel render').props.onClick();ui=ctx.render();
 assert.ok(ctx.button(ui,'Render'));assert.deepEqual(ctx.stats(),{preflights:1,saves:1,queues:1,cancels:1});
});

test('unsupported edits show inside settings before file picker; no output is queued',async()=>{
 const ctx=bootstrap('E:\\Videos\\bad.mp4',{preflightError:'Native effect not implemented'});
 let ui=ctx.render();await ctx.button(ui,'Render').props.onClick();await flush();ui=ctx.render();
 assert.deepEqual(ctx.stats(),{preflights:1,saves:0,queues:0,cancels:0});
 assert.ok(JSON.stringify(ui).includes('Native effect not implemented'));
});

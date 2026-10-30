'use strict';
/** Local CPU metrics; cannot establish Windows GPU / user-visible FPS. */
const fs=require('node:fs'),M=require('node:module'),ts=require('typescript');
const old=M._extensions['.ts'];M._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');const {defaultParameters}=require('../src/editor/effect-schema.ts');if(old)M._extensions['.ts']=old;
const w=1920,h=1080,source=new Uint8ClampedArray(w*h*4),dst=new Uint8ClampedArray(source.length);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;
 if(x<96||y<55||x>=w-96||y>=h-55)continue;
 source[i]=(x*3+y*7)%255;source[i+1]=(x*5+y*3)%255;source[i+2]=(x+y*2)%255;source[i+3]=255;
 if((x-900)**2+(y-400)**2<50**2){source[i]=255;source[i+1]=245;source[i+2]=235;}
}
const chosen=['atelier_3_12','atelier_7_0','atelier_7_1','atelier_7_2','atelier_7_11','atelier_6_1','atelier_6_3','atelier_6_6','atelier_7_7','atelier_7_13','atelier_5_12'];
console.log('1080p CPU exact render, 2 subsequent amount-only drags, ms; retained immutable source and cached preparation.');
for(const id of chosen){
 const f=DEDICATED_EFFECTS.get(id),settings=defaultParameters(id),times=[];
 for(const amount of [.70,.85,1]){
  const before=performance.now(),kernel=f({source,width:w,height:h,amount,parameters:settings});
  for(let y=0;y<h;y+=48)kernel.renderRows(y,Math.min(h,y+48),dst);
  times.push(Math.round((performance.now()-before)*10)/10);
 }
 console.log(id,times.join(' / '));
}

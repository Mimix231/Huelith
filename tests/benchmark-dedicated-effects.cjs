'use strict';
/** Reproducible CPU-only reference microbenchmark. Not a GPU or Windows FPS claim. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {DEDICATED_EFFECTS}=require(path.resolve(__dirname,'../src/editor/effects/index.ts'));
if(previous)Module._extensions['.ts']=previous;
const [w,h]=process.argv.includes('--large')?[1920,1080]:[640,360];
const input=new Uint8ClampedArray(w*h*4),output=new Uint8ClampedArray(input.length);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  input[i]=x%256;input[i+1]=y%256;input[i+2]=(x+y)%256;
  input[i+3]=x>w/9&&x<w*8/9&&y>h/9&&y<h*8/9?255:0;
  if((x*13+y*31)%1337<5){input[i]=input[i+1]=input[i+2]=255;}
}
console.log('Benchmark CPU only',w,h,'(median of 3, ms; includes preparation)');
for(const [name,factory] of DEDICATED_EFFECTS){
  const times=[];let checksum=0;
  for(let rep=0;rep<3;rep++){
    const started=performance.now();
    const kernel=factory({source:input,width:w,height:h,amount:.85,parameters:{frequency:50,threshold:170,centerX:50,centerY:50,angle:20,colorMix:50}});
    for(let row=0;row<h;row+=12)kernel.renderRows(row,Math.min(h,row+12),output);
    times.push(performance.now()-started);checksum+=output[((h>>1)*w+(w>>1))*4];
  }
  times.sort((a,b)=>a-b);
  console.log(name.padEnd(13),times[1].toFixed(1),'ms','checksum',checksum);
}

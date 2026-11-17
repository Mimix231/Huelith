import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {copyFile,link,mkdir,readdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';

/** The full BiRefNet weights have one authoritative source in src-tauri.
 * During dev Vite streams that file; during packaging it becomes ONE frontend
 * resource. We do not copy a second gigabyte into public/ or send it via IPC.
 */
function fullBirefnetResources():Plugin{
  const project=process.cwd();
  const weights=resolve(project,'src-tauri/resources/models/birefnet/model.onnx');
  const runtimeRoots=[resolve(project,'node_modules/onnxruntime-web/dist'),
    resolve(project,'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist')];
  const runtimeRoot=()=>runtimeRoots.find(existsSync);
  const runtimeFile=(filename:string)=>{
    if(!/^ort-wasm[\w.-]*\.(?:mjs|wasm)$/.test(filename))return null;
    const dir=runtimeRoot();return dir?resolve(dir,filename):null;
  };
  const expectedBytes=972666916; // Full FP32 model, never the Lite/FP16 variant
  return {
    name:'huelith-full-birefnet-local-resources',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        const url=req.url?.split('?')[0]??'';
        const modelRequest=url==='/models/birefnet/onnx/model.onnx';
        const runtimeMatch=/^\/models\/runtime\/(ort-wasm[\w.-]*\.(?:mjs|wasm))$/.exec(url);
        if(!modelRequest&&!runtimeMatch)return next();
        const file=modelRequest?weights:runtimeFile(runtimeMatch![1]);
        if(!file||!existsSync(file)){
          res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
          res.end(`Missing local BiRefNet ${modelRequest?'full model':'ONNX runtime'} asset. See BIREFNET-README.md.`);return;
        }
        const length=statSync(file).size;
        if(modelRequest&&length!==expectedBytes){
          res.writeHead(422,{'Content-Type':'text/plain; charset=utf-8'});
          res.end('The source model is not the complete full FP32 BiRefNet ONNX weights.');return;
        }
        const type=modelRequest?'application/octet-stream':file.endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8';
        res.writeHead(200,{'Content-Type':type,'Content-Length':String(length),'Cache-Control':'no-store','Accept-Ranges':'none'});
        if(req.method==='HEAD'){res.end();return;}
        if(req.method!=='GET'){res.end();return;}
        createReadStream(file).on('error',()=>res.destroy()).pipe(res);
      });
    },
    async closeBundle(){
      // Ordinary web-only builds can still compile without the huge local file;
      // installer builds MUST pass verify:birefnet before this step.
      if(!existsSync(weights)){
        console.warn('[BiRefNet] Full model absent from src-tauri/resources. Offline AI Cutout will not be included.');
        return;
      }
      if(statSync(weights).size!==expectedBytes)throw Error('Full BiRefNet must be the 972,666,916-byte FP32 model.');
      const dest=resolve(project,'dist/models/birefnet/onnx/model.onnx');
      await mkdir(resolve(project,'dist/models/birefnet/onnx'),{recursive:true});
      // Always unlink stale outputs. Same-size files are not proof of identity.
      await rm(dest,{force:true});
      try{await link(weights,dest);}catch{await copyFile(weights,dest);}
      // Prefer the current unextended upstream license, but also accept
      // LICENSE.txt from older Huelith source trees without overwriting it.
      const modelLicense=[
        resolve(project,'src-tauri/resources/models/birefnet/LICENSE'),
        resolve(project,'src-tauri/resources/models/birefnet/LICENSE.txt'),
      ].find(existsSync);
      if(!modelLicense)throw Error('BiRefNet LICENSE must accompany model.onnx in src-tauri/resources/models/birefnet/.');
      await copyFile(modelLicense,resolve(project,'dist/models/birefnet/LICENSE'));
      const runtime=runtimeRoot();
      if(!runtime)throw Error('Install @huggingface/transformers: ONNX Runtime WASM artifacts are missing.');
      const output=resolve(project,'dist/models/runtime');await mkdir(output,{recursive:true});
      for(const file of await readdir(runtime))if(/^ort-wasm[\w.-]*\.(?:mjs|wasm)$/.test(file)){
        await copyFile(join(runtime,file),join(output,file));
      }
      // Some onnxruntime-web npm distributions (including preview releases)
      // do not ship LICENSE as a standalone package file. Never copy the
      // BiRefNet model license in its place: use the runtime's own MIT notice.
      const dependencies=[
        {sources:[
          resolve(runtime,'../LICENSE'),resolve(runtime,'../LICENSE.txt'),
          resolve(project,'third-party-licenses/onnxruntime-MIT.txt'),
        ],destination:'LICENSE-onnxruntime-web.txt'},
        {sources:[
          resolve(project,'node_modules/@huggingface/transformers/LICENSE'),
          resolve(project,'node_modules/@huggingface/transformers/LICENSE.txt'),
          resolve(project,'third-party-licenses/transformers-js-APACHE-2.0.txt'),
        ],destination:'LICENSE-transformers-js.txt'},
      ];
      for(const {sources,destination} of dependencies){
        const license=sources.find(existsSync);
        if(!license)throw Error(`Required redistribution license missing: ${destination}. Check third-party-licenses/`);
        await copyFile(license,join(output,destination));
      }
    },
  };
}

export default defineConfig({
  plugins:[react(),fullBirefnetResources()],
  clearScreen:false,
  server:{port:1420,strictPort:true,host:'127.0.0.1',
    watch:{ignored:['**/src-tauri/**','**/output/**','**/zips/**','**/public/video-library/**']},
  },
  envPrefix:['VITE_','TAURI_ENV_'],
  worker:{format:'es'},
  build:{target:'es2022'},
});

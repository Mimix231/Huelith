/** Full BiRefNet OFFLINE resource verification.
 * No 973 MB duplication and no model download: the authoritative model is
 * already under src-tauri/resources/models/birefnet/model.onnx.
 * Vite serves it directly in dev and includes it once in its production dist.
 */
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MODEL_SHA256='58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c';
const MIN_MODEL_BYTES=750_000_000;
const MODEL_BYTES=972_666_916;
const root=resolve('src-tauri/resources/models/birefnet');
const model=resolve(root,'model.onnx');
const licenseFiles=[resolve(root,'LICENSE'),resolve(root,'LICENSE.txt')];
const runtimeDirs=[resolve('node_modules/onnxruntime-web/dist'),resolve('node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist')];
const sha256=file=>new Promise((yes,no)=>{
  const hash=createHash('sha256');
  const stream=createReadStream(file);
  stream.on('data',part=>hash.update(part));stream.on('end',()=>yes(hash.digest('hex')));stream.on('error',no);
});
export async function verifyBirefnetResources({dist=false}={}){
  if(!existsSync(model))throw Error(`Full BiRefNet model not found at ${model}. Keep your existing model.onnx there.`);
  const bytes=statSync(model).size;
  if(bytes<MIN_MODEL_BYTES||bytes!==MODEL_BYTES)throw Error(`Expected full BiRefNet FP32 (${MODEL_BYTES} bytes), got ${bytes}.`);
  if(await sha256(model)!==MODEL_SHA256)throw Error('Full BiRefNet ONNX checksum differs from the verified publisher model.');
  const license=licenseFiles.find(existsSync);
  if(!license||!statSync(license).size)throw Error(`Missing model license: ${licenseFiles.join(' or ')}`);
  for(const name of ['config.json','preprocessor_config.json']){
    const file=resolve('public/models/birefnet',name);
    if(!existsSync(file))throw Error(`Missing bundled JSON config: ${name}`);
    const json=JSON.parse(await readFile(file,'utf8'));
    if(name==='config.json'&&json.model_type!=='birefnet')throw Error('Wrong BiRefNet model config.');
    if(name==='preprocessor_config.json'&&(json.size?.width!==1024||json.size?.height!==1024))throw Error('BiRefNet needs 1024x1024 preprocessing.');
  }
  const runtime=runtimeDirs.find(existsSync);
  if(!runtime||(await readdir(runtime)).every(name=>!/^ort-wasm.*\.wasm$/.test(name)))
    throw Error('ONNX WASM runtime not installed. Run npm ci first.');
  const runtimeNotice=[resolve(runtime,'../LICENSE'),resolve(runtime,'../LICENSE.txt'),
    resolve('third-party-licenses/onnxruntime-MIT.txt')].find(existsSync);
  const transformersNotice=[resolve('node_modules/@huggingface/transformers/LICENSE'),
    resolve('node_modules/@huggingface/transformers/LICENSE.txt'),
    resolve('third-party-licenses/transformers-js-APACHE-2.0.txt')].find(existsSync);
  if(!runtimeNotice||!transformersNotice)
    throw Error('Required ONNX Runtime or Transformers.js license notice missing.');
  if(dist){
    const packaged=resolve('dist/models/birefnet/onnx/model.onnx');
    if(!existsSync(packaged)||statSync(packaged).size!==MODEL_BYTES)throw Error('Built frontend does not contain the full BiRefNet model.');
    const packagedRuntime=resolve('dist/models/runtime');
    if(!existsSync(packagedRuntime)||(await readdir(packagedRuntime)).every(name=>!/^ort-wasm.*\.wasm$/.test(name)))
      throw Error('Built frontend missing ONNX WASM binaries.');
    if(!existsSync(resolve('dist/models/birefnet/LICENSE')))throw Error('Built frontend missing BiRefNet MIT license.');
    for(const name of ['LICENSE-onnxruntime-web.txt','LICENSE-transformers-js.txt']){
      if(!existsSync(resolve(packagedRuntime,name)))throw Error(`Built frontend missing redistribution notice: ${name}`);
    }
  }
  console.log('Verified full BiRefNet FP32 model, SHA-256, configuration, license and ONNX runtime'+(dist?' in dist':'')+'.');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  if(process.argv.includes('--help')){
    console.log('Full BiRefNet is used directly from src-tauri/resources/models/birefnet/model.onnx.\nRun npm run verify:birefnet, then npm run tauri build. No model copying needed.');
  }else await verifyBirefnetResources({dist:process.argv.includes('--verify-dist')});
}

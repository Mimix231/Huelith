#!/usr/bin/env node
/** Native video effect inventory. Native Rust is authoritative; this script does
 * not mark generic placeholders or unimplemented shader names as supported.
 * Usage: node scripts/audit-native-renderer.mjs [--check]
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const registry=read('src-tauri/src/media/native_timeline/effect_registry.rs');
const list=registry.match(/pub const IMPLEMENTED:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/)?.[1];
if(!list)throw Error('Rust native-effect registry not found');
const supported=[...list.matchAll(/"([^"\n]+)"/g)].map(m=>m[1]);
if(new Set(supported).size!==supported.length)throw Error('Duplicate Rust native effect ID');
const rust=read('src-tauri/src/media/native_timeline.rs');
for(const id of supported){
  const branch=id==='video-filter'?/effect\.kind=="video-filter"/.test(rust)
    :['outline','pixelate','boxblur','posterize','solarize'].includes(id)?new RegExp('effect\\.kind=="'+id+'"').test(rust)
    :new RegExp('"'+id+'"\\s*(?:\\||=>)').test(rust);
  if(!branch)throw Error(`Native processor branch missing for ${id}`);
}
// Source registry includes the original 101 effects, the 120 named Creativity
// expansions, plus the native Video & Temporal entries and legacy cutout.
const catalog=read('src/editor/effect-catalog.ts');
const explicit=[...catalog.matchAll(/\bkind:\s*'([^']+)'\s*,\s*label:/g)].map(m=>m[1]);
const expansion=read('src/editor/expansion-120.ts');
const families=[...expansion.matchAll(/\['([^']+)',\s*\[([^\]]+)\]\]/g)];
const extra=[];
for(const [idx,group] of families.entries()){
 const names=[...group[2].matchAll(/'([^']+)'/g)];
 for(const [i] of names.entries())extra.push(`atelier_${idx}_${i}`);
}
if(families.length!==8||extra.length!==120)throw Error('Incomplete Creativity expansion catalog');
const video=read('src/editor/video/effects/catalog.ts');
const videoKinds=[...video.split('const native:')[1].split('];')[0].matchAll(/\bkind:'([^']+)'/g)].map(m=>m[1]);
const offered=[...new Set([...explicit,...extra,...videoKinds,'video-filter','cutout'])].sort();
const missing=offered.filter(name=>!supported.includes(name));
const advertised=supported.filter(name=>offered.includes(name));
const report={schema:1,backend:'Native Rust CPU compositor',gpuResident:false,
  catalogCount:offered.length,supportedCount:advertised.length,missingCount:missing.length,
  implemented:advertised,missing,
  notes:['Registry coverage is not proof of visual parity.','Native GPU-resident rendering is not yet implemented.','Unimplemented timeline operations must not be silently skipped.']};
const ts='/** AUTO-GENERATED. Run npm run audit:native-renderer. */\nexport const NATIVE_EFFECT_KINDS = '+JSON.stringify(supported,null,2)+' as const;\n';
const serialized=JSON.stringify(report,null,2)+'\n';
const paths=[['src/editor/video/native-capabilities.generated.ts',ts],['docs/native-video-effect-coverage.json',serialized]];
if(process.argv.includes('--check')){
 for(const [p,expected] of paths)if(read(p)!==expected)throw Error(`Stale ${p}; run npm run audit:native-renderer`);
}else{
 for(const [p,value] of paths)writeFileSync(resolve(root,p),value);
}
console.log(`[native-audit] ${advertised.length}/${offered.length} registered effects have native processors; ${missing.length} are still missing.`);

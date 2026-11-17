/** Optional Tauri launcher for Windows volumes where Cargo cannot hard-link
 * incremental cache files. It keeps the normal `npm run tauri dev` untouched.
 * On E: drives without hard-link support, incremental = 0 avoids repeated
 * cache warnings; compilation may be slower than on an NTFS workspace.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(fileURLToPath(new URL('..',import.meta.url)));
const entry=resolve(project,'node_modules/@tauri-apps/cli/tauri.js');
if(!existsSync(entry)){
  console.error('Tauri CLI is missing. Run npm ci before starting the desktop app.');
  process.exit(1);
}
const args=process.argv.slice(2);
if(!args.length)args.push('dev');
const child=spawn(process.execPath,[entry,...args],{
  cwd:project,stdio:'inherit',
  env:{...process.env,CARGO_INCREMENTAL:'0'},
});
child.on('error',error=>{console.error(`Cannot launch Tauri: ${error.message}`);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});

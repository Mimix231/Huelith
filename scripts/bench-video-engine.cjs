/** Compile an unchanged project range through the production native graph.
 * Usage: node scripts/bench-video-engine.cjs <project.huelith> [start] [seconds]
 * The project and its referenced media are read-only; output lives in TEMP.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildSync}=require('esbuild');
const project=path.resolve(process.argv[2]||'');
const start=Number(process.argv[3]??13),seconds=Number(process.argv[4]??6);
if(!fs.statSync(project).isFile()||!Number.isFinite(start)||!Number.isFinite(seconds)||start<0||seconds<=0)
  throw Error('Pass a project file, a nonnegative start and a positive duration.');
const root=path.resolve(__dirname,'..'),folder=path.join(os.tmpdir(),'Huelith-Engine-20261117');
fs.mkdirSync(folder,{recursive:true});
const planFile=path.join(folder,`range-${start}-${seconds}.json`);
const code=buildSync({stdin:{contents:`
  import fs from 'node:fs';import path from 'node:path';
  import {prepareNativeTimelinePlan} from './src/editor/video/native-timeline-export';
  const project=JSON.parse(fs.readFileSync(${JSON.stringify(project)},'utf8'));
  const root=${JSON.stringify(root)};
  const timeline={...project.timeline,assets:project.timeline.assets.map(asset=>({...asset,
    path:asset.libraryId?path.join(root,'public/video-library',asset.libraryId):asset.path,libraryId:undefined}))};
  const start=${start},end=Math.min(start+${seconds},Math.max(...timeline.clips.map(c=>c.start+c.duration)));
  prepareNativeTimelinePlan({timeline,range:{start,end},width:project.width,height:project.height,
    fps:project.fps,frameCount:Math.ceil((end-start)*project.fps-1e-7),outputPath:${JSON.stringify(path.join(folder,'benchmark.mp4'))}})
    .then(plan=>{fs.writeFileSync(${JSON.stringify(planFile)},JSON.stringify(plan));console.log(${JSON.stringify(planFile)});})
    .catch(error=>{console.error(error);process.exitCode=1;});
`,resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'error'}).outputFiles[0].text;
const Module=require('node:module'),entry=new Module(path.join(root,'.engine-benchmark.cjs'),module);
entry.filename=path.join(root,'.engine-benchmark.cjs');entry.paths=module.paths;
entry._compile(code,entry.filename);

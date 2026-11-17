#!/usr/bin/env node
/** Offline release QA, NEVER part of Huelith's video-rendering engine.
 * Uses optional ffprobe/ffmpeg *only to inspect* two already-exported MP4s.
 * Example:
 *   node scripts/verify-video-render-parity.mjs reference.mp4 native.mp4
 * The baseline must be exported from the same unchanged project, range and
 * settings as the experimental native decode run.
 */
import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';

function command(binary,args,limit=80*1024*1024){
  return new Promise((ok,fail)=>{
    const child=spawn(binary,args,{windowsHide:true});let size=0;const chunks=[];const errors=[];
    child.stdout.on('data',data=>{size+=data.length;if(size>limit){child.kill();fail(Error(`${binary} output exceeded analysis limit`));return;}chunks.push(data);});
    child.stderr.on('data',data=>errors.push(data));
    child.on('error',error=>fail(new Error(`Cannot run ${binary}: ${error.message}`)));
    child.on('close',code=>code===0?ok(Buffer.concat(chunks)):
      fail(Error(`${binary} failed: ${Buffer.concat(errors).toString('utf8').slice(-1000)}`)));
  });
}
async function probe(file){
  const output=await command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]);
  const result=JSON.parse(output.toString());
  const video=result.streams.find(item=>item.codec_type==='video');
  if(!video)throw Error(`No decodable video track: ${file}`);
  const audio=result.streams.find(item=>item.codec_type==='audio');
  const [num,den]=(video.avg_frame_rate||'0/1').split('/').map(Number);
  const duration=Number(video.duration??result.format.duration);
  if(!Number.isFinite(duration)||duration<=0)throw Error('Container video duration is invalid');
  return {width:video.width,height:video.height,duration,fps:num/den,
    audio:!!audio,audioCodec:audio?.codec_name,videoCodec:video.codec_name,
    bytes:(await stat(file)).size};
}
async function sample(file,time,width,height){
  // Comparing downsampled decoded outputs makes QA fast and keeps buffers bounded.
  const size=`${width}:${height}`;
  return command('ffmpeg',['-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf',`scale=${size}:flags=bicubic`,'-f','rawvideo','-pix_fmt','rgb24','-'],width*height*3+2048);
}
function difference(a,b){
  if(a.length!==b.length||!a.length)throw Error('Decoded frame sizes differ');
  let sum=0,changed=0;
  for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);sum+=delta;if(delta>25)changed++;}
  return {meanAbsError:sum/a.length,componentDifferenceRatio:changed/a.length};
}
const [oldFile,newFile]=process.argv.slice(2);
if(!oldFile||!newFile){
  console.error('Usage: node scripts/verify-video-render-parity.mjs baseline.mp4 experimental.mp4');
  process.exitCode=2;
}else{
  try{
    const first=resolve(oldFile),second=resolve(newFile);
    const [baseline,native]=await Promise.all([probe(first),probe(second)]);
    const report={baseline,native,metadataMatches:baseline.width===native.width&&baseline.height===native.height
      &&Math.abs(baseline.duration-native.duration)<.1&&Math.abs(baseline.fps-native.fps)<.1
      &&baseline.audio===native.audio,samples:[]};
    if(!report.metadataMatches)console.warn('Output video metadata or audio presence differs');
    const width=320,height=180;
    for(const fraction of [0,.05,.1,.2,.35,.5,.65,.8,.9,.98]){
      const time=Number((Math.min(baseline.duration,native.duration)*fraction).toFixed(3));
      const [original,experimental]=await Promise.all([sample(first,time,width,height),sample(second,time,width,height)]);
      report.samples.push({time,...difference(original,experimental)});
    }
    const worst=Math.max(...report.samples.map(item=>item.meanAbsError));
    console.log(JSON.stringify({...report,worstMeanAbsError:worst},null,2));
    // Report findings without pretending that one universal lossy-codec
    // tolerance proves scene parity. Human inspection remains mandatory.
    if(!report.metadataMatches||worst>12)process.exitCode=1;
  }catch(error){console.error(String(error));process.exitCode=1;}
}

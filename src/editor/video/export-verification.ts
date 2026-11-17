import type {NativeExportReport,NativeVideoInfo} from './native-media';

/** Independent verification of the file, not simply confirmation that an encoder command returned. */
export function verifyEncodedVideo(expected:{width:number;height:number;fps:number;frameCount:number},
  report:NativeExportReport,info:NativeVideoInfo):void {
  if(report.framesWritten!==expected.frameCount)throw Error(`Incomplete video export: encoded ${report.framesWritten} of ${expected.frameCount} frames.`);
  if(report.width!==expected.width||report.height!==expected.height||info.width!==expected.width||info.height!==expected.height)
    throw Error(`Export dimensions don't match ${expected.width} × ${expected.height}.`);
  if(!Number.isFinite(info.frameRateNumerator)||!Number.isFinite(info.frameRateDenominator)||info.frameRateDenominator<=0)
    throw Error('Exported video is missing a valid frame rate.');
  const actualRate=info.frameRateNumerator/info.frameRateDenominator;
  if(Math.abs(actualRate-expected.fps)>Math.max(.15,expected.fps*.008))
    throw Error(`Exported frame rate ${actualRate.toFixed(2)} differs from the requested ${expected.fps} fps.`);
  // Some decoders do not expose container duration. Validate it when available.
  if(info.duration100ns!==null&&Number.isFinite(info.duration100ns)&&info.duration100ns>0){
    const duration=info.duration100ns/10_000_000;
    const expectedSeconds=expected.frameCount/expected.fps;
    if(Math.abs(duration-expectedSeconds)>Math.max(.5,3/expected.fps))
      throw Error(`Exported duration ${duration.toFixed(2)}s differs from ${expectedSeconds.toFixed(2)}s.`);
  }
}

/** Export an exact Rust-composited frame, never a WebView screenshot. */
import {nativePreviewPlan,renderNativeTimelinePng} from './native-frame-renderer';
import type { VideoTimeline } from './timeline';

export type FramePngRequest = {
  timeline: VideoTimeline;
  time: number;
  width: number;
  height: number;
  fps: number;
  projectName: string;
};

function validateFrame(request: FramePngRequest) {
  if (![request.time, request.width, request.height, request.fps].every(Number.isFinite))
    throw Error('Invalid frame time, resolution, or frame rate.');
  if (request.time < 0 || request.fps < 1 || request.width < 1 || request.height < 1)
    throw Error('Frame position, resolution, and frame rate must be positive.');
  if (request.width > 3840 || request.height > 2160 || request.width * request.height > 8_294_400)
    throw Error('This frame is too large to export safely as a PNG.');
}

export function framePngFilename(name: string, time: number, fps: number) {
  const frame = Math.max(0, Math.floor(time * fps + 1e-7));
  const seconds = Math.floor(frame / fps);
  const millis = Math.round((frame % fps) / fps * 1000);
  const stamp = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join('-');
  const safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 72) || 'Huelith';
  return `${safe}-frame-${stamp}-${String(millis).padStart(3, '0')}.png`;
}

export async function renderTimelinePng(request: FramePngRequest): Promise<Uint8Array> {
  validateFrame(request);
  const frameTime = Math.floor(request.time * request.fps + 1e-7) / request.fps;
  const plan=await nativePreviewPlan(request.timeline,request.width,request.height,request.fps);
  const bytes=await renderNativeTimelinePng(plan,frameTime);
  if(bytes.length<8||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)
    throw Error('Native PNG renderer did not produce a PNG image.');
  return bytes;
}

/** Returns the saved pathname, 'download' on web, or null when dismissed. */
export async function saveTimelineFramePng(request: FramePngRequest, nativeDesktop: boolean): Promise<string | null> {
  validateFrame(request);
  const filename = framePngFilename(request.projectName, request.time, request.fps);
  if (nativeDesktop) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({defaultPath: filename, filters: [{name: 'PNG image', extensions: ['png']}]});
    if (!path) return null;
    const bytes = await renderTimelinePng(request);
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes); // Native save dialog owns overwrite confirmation.
    return path;
  }
  throw Error('Video Editor PNG frame export requires the native Windows renderer. No browser renderer is installed.');
}

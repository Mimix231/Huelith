import { invoke } from '@tauri-apps/api/core';
import { isNativeMediaDesktop } from './native-media';
import {catalogueLink as link,allowedRecordingLicense as allowedLicense,validRecordingCredit,type RecordingCredit} from './recording-credit';

export type Recording = RecordingCredit & {
  id: string;
  url: string;
  duration: number;
  size: number;
};

export const RECORDING_LIMIT = 64 * 1024 * 1024;
const MAX_SECONDS = 600;
const COMMONS = 'https://commons.wikimedia.org';

type FileInfo = {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  duration?: number;
  size?: number;
  extmetadata?: Record<string, { value?: string }>;
};

function plain(html: string, limit: number): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const node of document.querySelectorAll('script,style,iframe,object')) node.remove();
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export async function searchRecordings(query: string, category: string, next: number, signal?: AbortSignal) {
  const kind = category === 'Sound effects' ? 'sound effect' : category === 'Music' ? 'music' : '';
  const words = (query.trim() || (kind === 'sound effect' ? 'nature' : kind === 'music' ? 'instrumental' : 'instrumental music')).replace(/[^\p{L}\p{N} \-]/gu, ' ').slice(0, 120);
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '24', gsroffset: String(next),
    gsrsearch: `${words} ${kind} filetype:audio`,
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata',
    iiextmetadatafilter: 'License|LicenseUrl|LicenseShortName|Artist|Restrictions',
    format: 'json', formatversion: '2', origin: '*',
  });
  const response = await fetch(`${COMMONS}/w/api.php?${params}`, {
    signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    credentials: 'omit', headers: { 'Api-User-Agent': 'Huelith/0.3 (local video editor)' },
  });
  if (!response.ok) throw Error(`Wikimedia Commons returned HTTP ${response.status}.`);
  const data = await response.json() as {
    error?: { info: string }; continue?: { gsroffset: number };
    query?: { pages?: { pageid: number; index?: number; title: string; imageinfo?: FileInfo[] }[] };
  };
  if (data.error) throw Error(data.error.info);
  const recordings: Recording[] = [];
  const pages = [...data.query?.pages ?? []].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const page of pages) {
    const file = page.imageinfo?.[0], metadata = file?.extmetadata;
    if (!file || !metadata || metadata.Restrictions?.value?.trim()) continue;
    if (!(file.mime?.startsWith('audio/') || file.mime === 'application/ogg' && /\.(ogg|oga|opus)$/i.test(page.title))) continue;
    const url = link(file.url, 'upload.wikimedia.org', '/wikipedia/commons/');
    const sourceUrl = link(file.descriptionurl, 'commons.wikimedia.org', '/wiki/File:');
    const licenseUrl = allowedLicense(metadata.LicenseUrl?.value);
    const duration = file.duration ?? 0, size = file.size ?? 0;
    if (!url || !sourceUrl || !licenseUrl || duration < .1 || duration > MAX_SECONDS || size <= 0 || size > RECORDING_LIMIT) continue;
    const creator = plain(metadata.Artist?.value ?? '', 512);
    const version=licenseUrl.pathname.split('/')[3];
    const license=plain(metadata.LicenseShortName?.value??'',128)||(licenseUrl.pathname.startsWith('/licenses/')?`CC BY ${version}`:'CC0 1.0');
    if (!creator && licenseUrl.pathname.startsWith('/licenses/')) continue;
    recordings.push({
      id: `commons-${page.pageid}`, title: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').slice(0, 512),
      creator: creator || 'See recording source', license,
      licenseUrl: licenseUrl.href, sourceUrl: sourceUrl.href, url: url.href, duration, size,
    });
  }
  return { recordings, next: data.continue?.gsroffset };
}

export async function readRecording(item: Recording, signal?: AbortSignal) {
  const url = link(item.url, 'upload.wikimedia.org', '/wikipedia/commons/');
  if (!url || !validRecordingCredit(item)) throw Error('The recording has invalid source or licence information.');
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000), credentials: 'omit', redirect: 'error' });
  if (!response.ok || !response.body) throw Error(`Could not download this recording (HTTP ${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RECORDING_LIMIT) throw Error('The recording exceeds the 64 MiB download limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
}

/** PCM is supported by both WebView and the native export mixer. */
export function pcmWave(buffer: AudioBuffer): { bytes: Uint8Array<ArrayBuffer>; waveform: number[] } {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length * channels * 2;
  const bytes = new Uint8Array(44 + length), view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  ascii(0, 'RIFF'); view.setUint32(4, 36 + length, true);
  ascii(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, length, true);
  const pcm = new Int16Array(bytes.buffer, 44);
  const peaks = new Array<number>(512).fill(0);
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let frame = 0; frame < buffer.length; frame++) {
      const sample = Math.max(-1, Math.min(1, data[frame]));
      pcm[frame * channels + channel] = Math.round(sample * 32767);
      const index = Math.floor(frame * peaks.length / buffer.length);
      peaks[index] = Math.max(peaks[index], Math.abs(sample));
    }
  }
  return { bytes, waveform: peaks };
}

export async function importRecording(item: Recording, signal?: AbortSignal) {
  const blob = await readRecording(item, signal);
  const context = new OfflineAudioContext(2, 1, 44100);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  signal?.throwIfAborted();
  if (buffer.duration < .1 || buffer.duration > MAX_SECONDS || buffer.numberOfChannels < 1) throw Error('This recording has an unsupported duration or format.');
  const { bytes, waveform } = pcmWave(buffer);
  const name = `${item.title.slice(0, 220)}.wav`;
  const path = isNativeMediaDesktop() ? await invoke<string>('video_store_recording', bytes) : undefined;
  signal?.throwIfAborted();
  const credit: RecordingCredit = { title: item.title, creator: item.creator, license: item.license, licenseUrl: item.licenseUrl, sourceUrl: item.sourceUrl };
  return { name, path, file: path ? undefined : new File([bytes], name, { type: 'audio/wav' }), duration: buffer.duration, waveform, credit };
}

export function recordingCredits(credits: readonly RecordingCredit[]) {
  return [...new Map(credits.map(credit => [credit.sourceUrl, credit])).values()]
    .map(credit => `${credit.title}\n${credit.creator}\n${credit.license}: ${credit.licenseUrl}\nSource: ${credit.sourceUrl}`).join('\n\n');
}

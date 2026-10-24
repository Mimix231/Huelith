import { activeTab, useEditor } from './store';
import { frameDocument } from './animation';
import { prepareImages, exportCanvas } from './render';
import { saveBytes } from './files';
import type { Document } from './types';

interface Chunk {
  name: string;
  bytes: Uint8Array;
}

function u32(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, value, false);
  return buffer;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of input) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const kind = new TextEncoder().encode(name);
  const body = concat([kind, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function readPng(input: Uint8Array): Chunk[] {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => input[index] === value)) throw new Error('Invalid frame PNG.');
  const result: Chunk[] = [];
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let offset = signature.length;
  while (offset + 12 <= input.length) {
    const size = view.getUint32(offset);
    if (size > input.length - offset - 12) throw new Error('Damaged PNG frame.');
    const name = String.fromCharCode(...input.slice(offset + 4, offset + 8));
    const bytes = input.slice(offset + 8, offset + 8 + size);
    result.push({ name, bytes });
    offset += size + 12;
    if (name === 'IEND') return result;
  }
  throw new Error('Incomplete PNG frame.');
}

async function pngBytes(doc: Document): Promise<Uint8Array> {
  await prepareImages(doc);
  const canvas = exportCanvas(doc);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
    if (result) resolve(result);
    else reject(new Error('PNG frame encoding failed.'));
  }, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** APNG 1.0: first frame IDAT + subsequent fdAT, including per-frame timing. */
export function encodeApng(frames: Uint8Array[], durations: number[], loops = 0): Uint8Array {
  if (!frames.length || frames.length !== durations.length) throw new Error('APNG requires frames and durations.');
  const parsed = frames.map(readPng);
  const first = parsed[0];
  const header = first.find(chunk => chunk.name === 'IHDR');
  if (!header) throw new Error('Missing PNG IHDR.');
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  let sequence = 0;
  // APNG animation control must follow IHDR and precede IDAT.
  parts.push(pngChunk('IHDR', header.bytes));
  parts.push(pngChunk('acTL', concat([u32(frames.length), u32(loops)])));
  for (const chunk of first.slice(1)) {
    if (['IDAT', 'IEND', 'acTL', 'fcTL', 'fdAT'].includes(chunk.name)) continue;
    // Known safe PNG color/metadata ancillary chunks; all frames originate from Canvas2D.
    if (['sRGB', 'gAMA', 'cHRM', 'iCCP', 'pHYs', 'PLTE', 'tRNS'].includes(chunk.name)) {
      parts.push(pngChunk(chunk.name, chunk.bytes));
    }
  }
  frames.forEach((_, index) => {
    const count = Math.max(16, Math.min(60_000, Math.round(durations[index])));
    const delayNumerator = Math.min(65535, count);
    const control = concat([
      u32(sequence++), header.bytes.slice(0, 8),
      new Uint8Array(8), // x_offset, y_offset = 0
      new Uint8Array([delayNumerator >> 8, delayNumerator & 255, 0x03, 0xe8, 0, 0]),
    ]);
    parts.push(pngChunk('fcTL', control));
    for (const chunk of parsed[index]) {
      if (chunk.name !== 'IDAT') continue;
      if (index === 0) parts.push(pngChunk('IDAT', chunk.bytes));
      else parts.push(pngChunk('fdAT', concat([u32(sequence++), chunk.bytes])));
    }
  });
  parts.push(pngChunk('IEND', new Uint8Array()));
  return concat(parts);
}

function u16le(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >> 8) & 255]);
}

function u32le(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255]);
}

/** Minimal stored ZIP for transparent PNG frame sequences; no additional library. */
export function encodeZip(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = concat([
      u32le(0x04034b50), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(crc), u32le(entry.bytes.length), u32le(entry.bytes.length), u16le(name.length), u16le(0), name,
    ]);
    body.push(local, entry.bytes);
    central.push(concat([
      u32le(0x02014b50), u16le(20), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(crc), u32le(entry.bytes.length), u32le(entry.bytes.length), u16le(name.length), u16le(0),
      u16le(0), u16le(0), u16le(0), u32le(0), u32le(offset), name,
    ]));
    offset += local.length + entry.bytes.length;
  }
  const directory = concat(central);
  return concat([
    ...body, directory, u32le(0x06054b50), u16le(0), u16le(0), u16le(entries.length),
    u16le(entries.length), u32le(directory.length), u32le(offset), u16le(0),
  ]);
}

export async function exportAnimation(format: 'apng' | 'sheet' | 'sequence'): Promise<boolean> {
  useEditor.getState().commitTextDraft();
  const doc = activeTab(useEditor.getState()).doc;
  if (!doc.animation) throw new Error('Create an animation project before exporting frames.');
  const { frames } = doc.animation;
  if (frames.length > 300 || doc.width * doc.height * frames.length > 120_000_000) {
    throw new Error('Animation export exceeds the current 300-frame / 120-megapixel-frame budget. Try smaller frames or export in batches.');
  }
  const name = doc.name.replace(/[^\w.-]/g, '_') || 'Animation';
  if (format === 'sheet') {
    const columns = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / columns);
    if (doc.width * columns > 16384 || doc.height * rows > 16384 || doc.width * columns * doc.height * rows > 64_000_000) {
      throw new Error('Sprite sheet exceeds maximum canvas size (16384 pixels per side, 64 million pixels total). Export PNG sequence instead.');
    }
    const sheet = document.createElement('canvas');
    sheet.width = doc.width * columns;
    sheet.height = doc.height * rows;
    const ctx = sheet.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    for (let index = 0; index < frames.length; index++) {
      const frame = frameDocument(doc, index);
      await prepareImages(frame);
      ctx.drawImage(exportCanvas(frame), (index % columns) * doc.width, Math.floor(index / columns) * doc.height);
    }
    const blob = await new Promise<Blob>((resolve, reject) => sheet.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode sprite sheet.')), 'image/png'));
    return Boolean(await saveBytes(new Uint8Array(await blob.arrayBuffer()), `${name}-sheet.png`, 'image/png', [{ name: 'PNG', extensions: ['png'] }]));
  }
  const encoded: Uint8Array[] = [];
  for (let index = 0; index < frames.length; index++) {
    encoded.push(await pngBytes(frameDocument(doc, index)));
  }
  const bytes = format === 'apng'
    ? encodeApng(encoded, frames.map(frame => frame.durationMs))
    : encodeZip(encoded.map((frame, index) => ({ name: `frame-${String(index + 1).padStart(4, '0')}.png`, bytes: frame })));
  const ext = format === 'apng' ? 'png' : 'zip';
  const mime = format === 'apng' ? 'image/png' : 'application/zip';
  return Boolean(await saveBytes(bytes, `${name}-${format}.${ext}`, mime, [{ name: format.toUpperCase(), extensions: [ext] }]));
}

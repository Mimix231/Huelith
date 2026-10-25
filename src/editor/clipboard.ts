import { activeTab, useEditor } from './store';
import { decodeImage, prepareImages, exportCanvas } from './render';
import { makeRaster, makeVector, uid, type VectorShape } from './types';

const INTERNAL_TYPE = 'application/x-huelith-object';
let localClipboard: VectorShape | null = null;

function fileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read pasted image.'));
    reader.readAsDataURL(file);
  });
}

function decodeDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return decodeImage(dataUrl).then(image => {
    if (!image) throw new Error('Clipboard contained an empty image.');
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
}

export async function insertImage(blob: Blob, name = 'Pasted image'): Promise<boolean> {
  if (!blob.type.startsWith('image/')) return false;
  const url = await fileAsDataUrl(blob);
  const dims = await decodeDimensions(url);
  if (dims.width * dims.height > 64_000_000 || dims.width > 16384 || dims.height > 16384) {
    throw new Error('Pasted image exceeds the supported 64 megapixel / 16384px limit.');
  }
  const state = useEditor.getState();
  const doc = activeTab(state).doc;
  const image = document.createElement('canvas');
  image.width = dims.width;
  image.height = dims.height;
  const ctx = image.getContext('2d');
  const decoded = await decodeImage(url);
  if (!ctx || !decoded) throw new Error('Could not decode clipboard image.');
  ctx.drawImage(decoded, 0, 0);
  const prepared = image.toDataURL('image/png');
  if (activeTab(useEditor.getState()).doc.id !== doc.id) return false;
  state.mutate(document => {
    const layer = makeRaster(name);
    layer.image = prepared;
    layer.imageWidth = dims.width;
    layer.imageHeight = dims.height;
    layer.x = Math.round((document.width - dims.width) / 2);
    layer.y = Math.round((document.height - dims.height) / 2);
    document.layers.push(layer);
    document.activeLayerId = layer.id;
  });
  return true;
}

function pasteVector(shape: VectorShape): void {
  const state = useEditor.getState();
  state.mutate(doc => {
    const target = makeVector('Pasted vector');
    const copied = structuredClone(shape);
    copied.id = uid();
    target.shapes.push(copied);
    doc.layers.push(target);
    doc.activeLayerId = target.id;
  });
  state.selectShape(null);
}

/** Browser ClipboardEvent; native image-paste is handled via plugin fallback when necessary. */
export async function handlePaste(event: ClipboardEvent): Promise<boolean> {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
  const raw = clipboard.getData(INTERNAL_TYPE);
  if (raw) {
    try {
      const shape = JSON.parse(raw) as VectorShape;
      if (shape && typeof shape.id === 'string' &&
        ['rect', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'path', 'text'].includes(shape.kind) &&
        [shape.x, shape.y, shape.width, shape.height, shape.strokeWidth].every(Number.isFinite) &&
        (!shape.nodes || (Array.isArray(shape.nodes) && shape.nodes.length <= 20000))) {
        pasteVector(shape);
        return true;
      }
    } catch { /* Untrusted clipboard content; try an image instead. */ }
  }
  const items = [...clipboard.items];
  const image = items.find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
  if (image) return insertImage(image);
  if (localClipboard && (
    (clipboard.getData('text/plain').startsWith('Huelith vector:') ||
    clipboard.getData('text/plain').startsWith('Spectrum vector:')) ||
    !clipboard.types.includes('text/plain') && !clipboard.types.includes('text/html')
  )) {
    pasteVector(localClipboard);
    return true;
  }
  return false;
}

export async function pasteFromSystem(): Promise<boolean> {
  if ('__TAURI_INTERNALS__' in window) {
    const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
    let image: Awaited<ReturnType<typeof readImage>>;
    try { image = await readImage(); }
    catch (error) {
      if (localClipboard) { pasteVector(localClipboard); return true; }
      throw error;
    }
    const bytes = await image.rgba();
    const dimensions = await image.size();
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), dimensions.width, dimensions.height), 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    await image.close();
    return blob ? insertImage(blob) : false;
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const mime = item.types.find(type => type.startsWith('image/'));
    if (mime) return insertImage(await item.getType(mime));
  }
  if (localClipboard) {
    pasteVector(localClipboard);
    return true;
  }
  return false;
}

export async function copySelected(event?: ClipboardEvent, cut = false): Promise<boolean> {
  const state = useEditor.getState();
  const doc = activeTab(state).doc;
  const layer = doc.layers.find(item => item.id === doc.activeLayerId);
  const shape = layer?.type === 'vector' ? layer.shapes.find(item => item.id === state.selectedShapeId) : undefined;
  if (shape) {
    localClipboard = structuredClone(shape);
    if (event?.clipboardData) {
      event.clipboardData.setData(INTERNAL_TYPE, JSON.stringify(shape));
      event.clipboardData.setData('text/plain', `Huelith vector: ${shape.kind}`);
    }
    if (cut && !layer?.locked) state.removeShape(shape.id);
    return true;
  }
  if (!layer || !layer.visible) return false;
  await prepareImages(doc);
  let canvas = exportCanvas({ ...doc, background: 'transparent', layers: [layer] });
  const selection = state.selection;
  if (selection && selection.width > 0 && selection.height > 0) {
    const clipped = document.createElement('canvas');
    const x = Math.max(0, Math.floor(selection.x));
    const y = Math.max(0, Math.floor(selection.y));
    clipped.width = Math.min(doc.width - x, Math.ceil(selection.width));
    clipped.height = Math.min(doc.height - y, Math.ceil(selection.height));
    if (clipped.width <= 0 || clipped.height <= 0) return false;
    clipped.getContext('2d')?.drawImage(canvas, x, y, clipped.width, clipped.height,
      0, 0, clipped.width, clipped.height);
    canvas = clipped;
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  if ('__TAURI_INTERNALS__' in window) {
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
    const { Image } = await import('@tauri-apps/api/image');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const image = await Image.new(new Uint8Array(pixels.data), canvas.width, canvas.height);
    try { await writeImage(image); }
    finally { await image.close(); }
  } else if (navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } else {
    return false;
  }
  if (cut && !layer.locked && selection && layer.type === 'raster') {
    if (layer.rotation || layer.scaleX !== undefined && layer.scaleX !== 1 ||
      layer.scaleY !== undefined && layer.scaleY !== 1) {
      throw new Error('Cutting selections on transformed raster layers is not supported yet.');
    }
    const original = await decodeImage(layer.image);
    if (original && activeTab(useEditor.getState()).doc.id === doc.id) {
      const working = document.createElement('canvas');
      working.width = layer.imageWidth ?? doc.width;
      working.height = layer.imageHeight ?? doc.height;
      const ctx = working.getContext('2d');
      if (ctx) {
        ctx.drawImage(original, 0, 0);
        ctx.clearRect(selection.x - layer.x, selection.y - layer.y, selection.width, selection.height);
        useEditor.getState().mutate(document => {
          const target = document.layers.find(item => item.id === layer.id);
          if (target?.type === 'raster' && !target.locked) target.image = working.toDataURL('image/png');
        });
      }
    }
  } else if (cut && !layer.locked && doc.layers.length > 1) state.removeLayer();
  return true;
}

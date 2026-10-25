import { isDocument, makeRaster, type Document } from './types';
import { migrateLegacyEffects } from './effect-migration';
import { documentToSVG } from './svg';
import { exportCanvas, prepareImages } from './render';
import { activeTab, useEditor } from './store';

interface FileFilter {
  name: string;
  extensions: string[];
}

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9_. -]/gi, '_').replace(/\.+$/, '').trim() || 'Untitled';
}

function fileStem(name: string): string {
  return safeName(name).replace(/\.(huelith|spectrum|png|jpeg|jpg|webp|svg)$/i, '');
}

function download(bytes: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function saveBytes(bytes: Uint8Array, name: string, mime: string, filters: FileFilter[]): Promise<string | null> {
  if (isDesktop()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await dialog.save({ defaultPath: name, filters });
    if (!path) return null;
    await fs.writeFile(path, bytes);
    return path;
  }
  download(bytes, name, mime);
  return name;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.append(input);
    const finish = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

export async function saveProject(saveAs = false): Promise<boolean> {
  // Commit a live typography session before capturing the document revision.
  useEditor.getState().commitTextDraft();
  const state = useEditor.getState();
  const tab = activeTab(state);
  if (!tab) return false;

  // Capture both identity and revision: dialogs are asynchronous; tabs can switch mid-save.
  const { id } = tab.doc;
  const { revision, path } = tab;
  const bytes = new TextEncoder().encode(JSON.stringify(tab.doc, null, 2));

  if (isDesktop() && path && !saveAs) {
    const fs = await import('@tauri-apps/plugin-fs');
    await fs.writeFile(path, bytes);
    useEditor.getState().markSaved(id, revision, path);
    return true;
  }

  const chosen = await saveBytes(bytes, `${fileStem(tab.doc.name)}.huelith`, 'application/json', [
    { name: 'Huelith project', extensions: ['huelith', 'spectrum'] },
  ]);
  if (!chosen) return false;
  useEditor.getState().markSaved(id, revision, isDesktop() ? chosen : undefined);
  return true;
}

/**
 * Save every dirty document without changing the selected tab. The native
 * close confirmation uses this so no background tab can be silently lost.
 * A cancelled Save dialog or a write failure never reports success.
 */
export async function saveAllProjects(): Promise<boolean> {
  // Convert an active uncommitted text draft into document changes first.
  useEditor.getState().commitTextDraft();
  const dirtyIds = useEditor.getState().tabs
    .filter(tab => tab.dirty)
    .map(tab => tab.doc.id);

  for (const id of dirtyIds) {
    const tab = useEditor.getState().tabs.find(item => item.doc.id === id);
    if (!tab || !tab.dirty) continue;

    const bytes = new TextEncoder().encode(JSON.stringify(tab.doc, null, 2));
    const revision = tab.revision;
    let path = tab.path;

    if (isDesktop() && path) {
      const fs = await import('@tauri-apps/plugin-fs');
      await fs.writeFile(path, bytes);
    } else {
      const selectedPath = await saveBytes(
        bytes,
        `${fileStem(tab.doc.name)}.huelith`,
        'application/json',
        [{ name: 'Huelith project', extensions: ['huelith', 'spectrum'] }],
      );
      if (!selectedPath) return false;
      path = isDesktop() ? selectedPath : undefined;
    }

    useEditor.getState().markSaved(id, revision, path);
  }

  // Editing during an open Save dialog may change a revision. In that case
  // keep the window open rather than assuming the newer work was saved.
  const state = useEditor.getState();
  return state.textDraft === null && state.tabs.every(tab => !tab.dirty);
}

export async function openProject(): Promise<boolean> {
  let value: unknown;
  let path: string | undefined;

  if (isDesktop()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const selected = await dialog.open({
      multiple: false,
      filters: [{ name: 'Huelith project', extensions: ['huelith', 'spectrum'] }],
    });
    if (typeof selected !== 'string') return false;
    path = selected;
    value = JSON.parse(await fs.readTextFile(selected));
  } else {
    const file = await pickFile('.huelith,.spectrum,application/json');
    if (!file) return false;
    value = JSON.parse(await file.text());
  }

  if (!isDocument(value)) throw new Error('Invalid or unsupported Huelith project (.huelith or legacy .spectrum).');
  useEditor.getState().openDoc(migrateLegacyEffects(value), path);
  return true;
}

function imageMime(name: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'bmp') return 'image/bmp';
  return 'image/png';
}

export async function importImage(): Promise<boolean> {
  let bytes: Uint8Array;
  let name: string;
  let mime: string;

  if (isDesktop()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await dialog.open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (typeof path !== 'string') return false;
    bytes = await fs.readFile(path);
    name = path.split(/[\\/]/).at(-1) ?? 'Image';
    mime = imageMime(name);
  } else {
    const file = await pickFile('image/*');
    if (!file) return false;
    bytes = new Uint8Array(await file.arrayBuffer());
    name = file.name;
    mime = file.type || imageMime(name);
  }

  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.drawImage(image, 0, 0);

    const data = canvas.toDataURL('image/png');
    useEditor.getState().mutate(doc => {
      const layer = makeRaster(name);
      layer.image = data;
      layer.imageWidth = canvas.width;
      layer.imageHeight = canvas.height;
      doc.layers.push(layer);
      doc.activeLayerId = layer.id;
    });
    return true;
  } finally {
    image.close();
  }
}

export async function exportImage(format: 'png' | 'jpeg' | 'webp'): Promise<boolean> {
  useEditor.getState().commitTextDraft();
  const doc = activeTab(useEditor.getState()).doc;
  await prepareImages(doc);
  const canvas = exportCanvas(doc);

  // JPEG cannot preserve transparency: use a white backing surface.
  if (format === 'jpeg' && doc.background === 'transparent') {
    const backed = document.createElement('canvas');
    backed.width = canvas.width;
    backed.height = canvas.height;
    const ctx = backed.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, backed.width, backed.height);
    ctx.drawImage(canvas, 0, 0);
    return writeImage(backed, doc, format);
  }
  return writeImage(canvas, doc, format);
}

async function writeImage(canvas: HTMLCanvasElement, doc: Document, format: 'png' | 'jpeg' | 'webp'): Promise<boolean> {
  const mime = `image/${format}`;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode image.')), mime, 0.94);
  });
  if (blob.type !== mime && format !== 'png') throw new Error(`${format.toUpperCase()} encoding is unavailable.`);

  const extension = format === 'jpeg' ? 'jpg' : format;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Boolean(await saveBytes(bytes, `${fileStem(doc.name)}.${extension}`, mime, [
    { name: format.toUpperCase(), extensions: [extension] },
  ]));
}

export async function exportSvg(): Promise<boolean> {
  useEditor.getState().commitTextDraft();
  const doc = activeTab(useEditor.getState()).doc;
  await prepareImages(doc);
  const bytes = new TextEncoder().encode(documentToSVG(doc));
  return Boolean(await saveBytes(bytes, `${fileStem(doc.name)}.svg`, 'image/svg+xml', [
    { name: 'SVG', extensions: ['svg'] },
  ]));
}

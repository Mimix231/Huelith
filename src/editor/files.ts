import { isDocument, makeRaster, type Document } from './types';
import { migrateLegacyEffects } from './effect-migration';
import { documentToSVG } from './svg';
import { exportCanvas, prepareImages } from './render';
import { activeTab, useEditor } from './store';
import { bindOpenedDocumentRecentId, isVideoProject, recentId, recordRecentProject, type VideoProject } from './project-hub';

/** Capture the already-rendered canvas rather than re-running expensive effect stacks. */
function quickRecentThumbnail(): string | undefined {
  try {
    const source = document.querySelector<HTMLCanvasElement>('.artboard-canvas');
    if (!source || !source.width || !source.height) return undefined;
    const target = document.createElement('canvas'); target.width = 240; target.height = 144;
    const ctx = target.getContext('2d'); if (!ctx) return undefined;
    const scale = Math.min(target.width / source.width, target.height / source.height);
    const w = source.width * scale, h = source.height * scale;
    ctx.fillStyle = '#1b1b2b'; ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(source, (target.width - w) / 2, (target.height - h) / 2, w, h);
    const data = target.toDataURL('image/webp', 0.74);
    return data.length <= 80_000 ? data : undefined;
  } catch { return undefined; }
}


function thumbnailForSavedDoc(id: string): string | undefined {
  return activeTab(useEditor.getState()).doc.id === id ? quickRecentThumbnail() : undefined;
}

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

const projectWrites=new Map<string,Promise<void>>();
/** A validated native project reader also works for recents after a restart,
 * when the previous process's temporary file-dialog permission has expired. */
export async function readProjectFile(path:string):Promise<string>{
  const {invoke}=await import('@tauri-apps/api/core');return invoke('read_project_file',{path});
}
export async function writeProjectFile(path:string,bytes:Uint8Array):Promise<void>{
  const contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const key=path.replace(/\\/g,'/').toLowerCase();
  const write=(projectWrites.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
    const {invoke}=await import('@tauri-apps/api/core');await invoke('write_project_atomic',{path,contents});
  });
  projectWrites.set(key,write);try{await write;}finally{if(projectWrites.get(key)===write)projectWrites.delete(key);}
}
export async function saveBytes(bytes: Uint8Array, name: string, mime: string, filters: FileFilter[]): Promise<string | null> {
  if (isDesktop()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await dialog.save({ defaultPath: name, filters });
    if (!path) return null;
    if(/\.huelith$/i.test(path)&&mime==='application/json')await writeProjectFile(path,bytes);
    else await fs.writeFile(path, bytes);
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

  if (isDesktop() && path && /\.huelith$/i.test(path) && !saveAs) {
    await writeProjectFile(path, bytes);
    useEditor.getState().markSaved(id, revision, path);
    await recordRecentProject(tab.doc, path, thumbnailForSavedDoc(id)).catch(console.warn);
    return true;
  }

  const chosen = await saveBytes(bytes, `${fileStem(tab.doc.name)}.huelith`, 'application/json', [
    { name: 'Huelith project', extensions: ['huelith'] },
  ]);
  if (!chosen) return false;
  useEditor.getState().markSaved(id, revision, isDesktop() ? chosen : undefined);
  await recordRecentProject(tab.doc, isDesktop() ? chosen : undefined, thumbnailForSavedDoc(id)).catch(console.warn);
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

    if (isDesktop() && path && /\.huelith$/i.test(path)) {
      await writeProjectFile(path, bytes);
    } else {
      const selectedPath = await saveBytes(
        bytes,
        `${fileStem(tab.doc.name)}.huelith`,
        'application/json',
        [{ name: 'Huelith project', extensions: ['huelith'] }],
      );
      if (!selectedPath) return false;
      path = isDesktop() ? selectedPath : undefined;
    }

    useEditor.getState().markSaved(id, revision, path);
    await recordRecentProject(tab.doc, path, thumbnailForSavedDoc(id)).catch(console.warn);
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
    const selected = await dialog.open({
      multiple: false,
      filters: [{ name: 'Huelith project', extensions: ['huelith', 'spectrum'] }],
    });
    if (typeof selected !== 'string') return false;
    path = selected;
    value = JSON.parse(await readProjectFile(selected));
  } else {
    const file = await pickFile('.huelith,.spectrum,application/json');
    if (!file) return false;
    value = JSON.parse(await file.text());
  }

  if (!isDocument(value)) throw new Error('Invalid or unsupported Huelith project (.huelith or legacy .spectrum).');
  const doc = migrateLegacyEffects(value);
  useEditor.getState().openDoc(doc, path);
  if (!path) bindOpenedDocumentRecentId(activeTab(useEditor.getState()).doc.id, recentId(doc));
  await recordRecentProject(doc, path).catch(console.warn);
  return true;
}


/** Unified .huelith projects are discriminated by validated document contents, not filename. */
export async function openCreativeProject(): Promise<{ kind: 'image' | 'animation' | 'video'; video?: VideoProject; path?: string } | null> {
  let value: unknown;
  let path: string | undefined;
  if (isDesktop()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const selected = await dialog.open({ multiple: false, filters: [
      { name: 'Huelith projects', extensions: ['huelith', 'spectrum', 'huelithvideo'] },
    ] });
    if (typeof selected !== 'string') return null;
    path = selected;
    value = JSON.parse(await readProjectFile(selected));
  } else {
    const file = await pickFile('.huelith,.spectrum,.huelithvideo,application/json');
    if (!file) return null;
    value = JSON.parse(await file.text());
  }
  if (isVideoProject(value)) {
    await recordRecentProject(value, path).catch(console.warn);
    return { kind: 'video', video: value, path };
  }
  if (!isDocument(value)) throw new Error('Unsupported project file. Choose a Huelith image, animation, or video project.');
  const doc = migrateLegacyEffects(value);
  const existing = path && useEditor.getState().tabs.find(tab => tab.path === path);
  if (existing) useEditor.getState().activate(existing.doc.id);
  else {
    useEditor.getState().openDoc(doc, path);
    if (!path) bindOpenedDocumentRecentId(activeTab(useEditor.getState()).doc.id, recentId(doc));
  }
  await recordRecentProject(doc, path).catch(console.warn);
  return { kind: doc.animation ? 'animation' : 'image', path };
}

/** Reopens a known desktop project path; never treats a remembered path as trusted JSON. */
export async function openProjectPath(path: string): Promise<boolean> {
  if (!isDesktop()) return false;
  const existing = useEditor.getState().tabs.find(tab => tab.path === path);
  if (existing) { useEditor.getState().activate(existing.doc.id); return true; }
  const parsed: unknown = JSON.parse(await readProjectFile(path));
  if (!isDocument(parsed)) throw new Error('Recent project is invalid. Use Open project to select another file.');
  const doc = migrateLegacyEffects(parsed);
  useEditor.getState().openDoc(doc, path);
  await recordRecentProject(doc, path).catch(console.warn);
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

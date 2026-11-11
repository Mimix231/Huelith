/** Project Hub metadata is separate from document data and never changes .huelith schemas. */
import { isDocument, type Document } from './types';
import { isVideoTimeline, type VideoTimeline } from './video/timeline';
import type {SequenceIdentity,VideoSequence} from './video/sequences';

export type HubProjectKind = 'image' | 'animation' | 'video';
export type RecentProject = {
  id: string; kind: HubProjectKind; name: string; width: number; height: number;
  fps?: number; openedAt: number; path?: string; thumbnail?: string; snapshot?: boolean;
};
export type VideoProject = {
  format: 'huelith-video'; version: 1; id: string; name: string;
  width: number; height: number; fps: number; createdAt: string; updatedAt: string;
  timeline?: VideoTimeline; // optional for backward compatibility with Stage A/B projects
  sequence?: SequenceIdentity;
  sequences?: VideoSequence[];
  linkedVariants?:Record<string,string>;
  captionDictionary?: {find:string;replace:string}[];
};

const LIST_KEY = 'huelith-hub-recent-v1';
const DATABASE = 'huelith-hub-snapshots-v1';
const STORE = 'projects';
const MAX_RECENT = 24;
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
export const RECENTS_CHANGED = 'huelith-hub-recents-changed';

function sequenceIdentity(value: unknown): value is SequenceIdentity {
  const item = value as Partial<SequenceIdentity> | undefined;
  return !!item && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100
    && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120
    &&(item.safeInset===undefined||Number.isFinite(item.safeInset)&&item.safeInset>=4&&item.safeInset<=35);
}

function validSequences(project: VideoProject) {
  if (project.sequence !== undefined && !sequenceIdentity(project.sequence)) return false;
  if (project.sequences === undefined) return project.linkedVariants===undefined;
  if (!Array.isArray(project.sequences) || project.sequences.length > 31) return false;
  const ids = new Set([project.sequence?.id ?? 'main']);
  for (const sequence of project.sequences) {
    if (!sequenceIdentity(sequence) || ids.has(sequence.id)
      || ![sequence.width, sequence.height, sequence.fps].every(Number.isInteger)
      || sequence.width < 1 || sequence.height < 1 || sequence.width > 16384 || sequence.height > 16384
      || sequence.width * sequence.height > 64_000_000 || sequence.fps < 1 || sequence.fps > 120
      || !isVideoTimeline({ ...sequence.scene, assets: project.timeline?.assets ?? [] })) return false;
    ids.add(sequence.id);
  }
  const variants=project.linkedVariants;
  return variants===undefined||!!variants&&typeof variants==='object'&&!Array.isArray(variants)
    &&Object.entries(variants).every(([id,master])=>id!==master&&ids.has(id)&&ids.has(master)&&!Object.hasOwn(variants,master));
}

export function isVideoProject(value: unknown): value is VideoProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.format === 'huelith-video' && v.version === 1 && typeof v.id === 'string'
    && typeof v.name === 'string' && typeof v.createdAt === 'string'
    && typeof v.updatedAt === 'string' && Number.isInteger(v.width) && Number.isInteger(v.height)
    && (v.width as number) > 0 && (v.height as number) > 0 && (v.width as number) * (v.height as number) <= 64_000_000
    && (v.width as number) <= 16384 && (v.height as number) <= 16384
    && Number.isInteger(v.fps) && (v.fps as number) >= 1 && (v.fps as number) <= 120
    && (v.timeline === undefined || isVideoTimeline(v.timeline)) && validSequences(v as VideoProject)
    && (v.captionDictionary===undefined||Array.isArray(v.captionDictionary)&&v.captionDictionary.length<=100&&v.captionDictionary.every(item=>
      item&&typeof item.find==='string'&&item.find.length>0&&item.find.length<=120&&typeof item.replace==='string'&&item.replace.length<=120));
}
export function newVideoProject(name: string, width: number, height: number, fps: number): VideoProject {
  const now = new Date().toISOString();
  return { format: 'huelith-video', version: 1, id: crypto.randomUUID(), name: name.trim() || 'Untitled video',
    width, height, fps, createdAt: now, updatedAt: now };
}
// Editor tabs receive fresh IDs on open; preserve recent identity on web saves.
const openedDocumentIds = new Map<string, string>();
export function bindOpenedDocumentRecentId(workingId: string, recentId: string): void {
  openedDocumentIds.set(workingId, recentId);
  if (openedDocumentIds.size > 80) openedDocumentIds.delete(openedDocumentIds.keys().next().value!);
}
export function recentId(doc: Document | VideoProject, path?: string): string {
  if (!path) return openedDocumentIds.get(doc.id) ?? `document:${doc.id}`;
  const normalized = path.replace(/\\/g, '/');
  const windowsPath = /^[a-z]:\//i.test(normalized) || path.startsWith('\\\\');
  return `path:${windowsPath ? normalized.toLowerCase() : normalized}`;
}
function isRecent(value: unknown): value is RecentProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Partial<RecentProject>;
  return typeof r.id === 'string' && typeof r.name === 'string'
    && (r.kind === 'image' || r.kind === 'animation' || r.kind === 'video')
    && Number.isFinite(r.openedAt) && Number.isInteger(r.width) && Number.isInteger(r.height)
    && r.width! > 0 && r.height! > 0 && (!r.path || typeof r.path === 'string');
}
export function readRecentProjects(): RecentProject[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(items) ? items.filter(isRecent).slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function writeRecent(items: RecentProject[]): void {
  const previous = readRecentProjects();
  const kept = items.slice(0, MAX_RECENT);
  const ids = new Set(kept.map(item => item.id));
  for (const evicted of previous) if (!ids.has(evicted.id) && evicted.snapshot) {
    void snapshotDelete(evicted.id).catch(() => {});
  }
  try { localStorage.setItem(LIST_KEY, JSON.stringify(kept)); }
  catch { /* Editing and saving must work without localStorage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RECENTS_CHANGED));
}
function dbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function snapshotPut(id: string, project: Document | VideoProject): Promise<boolean> {
  if (JSON.stringify(project).length * 2 > MAX_SNAPSHOT_BYTES) return false;
  const db = await dbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(project, id);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    return true;
  } finally { db.close(); }
}
export async function readRecentSnapshot(id: string): Promise<Document | VideoProject | null> {
  const db = await dbOpen();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return isDocument(value) || isVideoProject(value) ? value : null;
  } finally { db.close(); }
}
async function snapshotDelete(id: string): Promise<void> {
  const db = await dbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export function removeRecentProject(id: string): void {
  writeRecent(readRecentProjects().filter(item => item.id !== id));
  void snapshotDelete(id).catch(() => {});
}
export function touchRecentProject(id: string): void {
  const existing = readRecentProjects();
  const found = existing.find(item => item.id === id);
  if (found) writeRecent([{ ...found, openedAt: Date.now() }, ...existing.filter(item => item.id !== id)]);
}
export async function recordRecentProject(project: Document | VideoProject, path?: string, thumbnail?: string): Promise<void> {
  const id = recentId(project, path);
  const kind: HubProjectKind = isVideoProject(project) ? 'video' : project.animation ? 'animation' : 'image';
  const previous = readRecentProjects().find(item => item.id === id);
  const entry: RecentProject = {
    id, kind, name: project.name, width: project.width, height: project.height,
    fps: isVideoProject(project) ? project.fps : project.animation?.fps,
    openedAt: Date.now(), ...(path ? { path } : {}),
    ...(thumbnail || previous?.thumbnail ? { thumbnail: thumbnail ?? previous?.thumbnail } : {}),
    snapshot: false,
  };
  // Desktop paths are authoritative; web downloads are reopened from a bounded IDB snapshot.
  if (!path && typeof indexedDB !== 'undefined') {
    try { entry.snapshot = await snapshotPut(id, project); } catch { entry.snapshot = false; }
  }
  // Read after the asynchronous snapshot write: simultaneous saves must not overwrite one another.
  const latest = readRecentProjects();
  writeRecent([entry, ...latest.filter(item => item.id !== id)]);
}

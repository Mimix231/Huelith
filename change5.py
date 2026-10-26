from pathlib import Path
root=Path('/mnt/data/huelith5')
def change(name,old,new,n=1):
 f=root/name;s=f.read_text();assert s.count(old)>=n,(name,old[:95],s.count(old));f.write_text(s.replace(old,new,n)); print(name,old[:45])
# AF: Make the actual worker retained-source budget follow device profiles. Never alter effect algorithms.
change('src/editor/effects-worker-client.ts',"{ graphMb: number; edgeMb: number; silhouetteMb: number; supersedeWindowMs: number }", "{ graphMb: number; edgeMb: number; silhouetteMb: number; sourceMb: number; supersedeWindowMs: number }")
change('src/editor/effects-worker-client.ts',"economy: { graphMb: 64, edgeMb: 16, silhouetteMb: 32, supersedeWindowMs: 650 }", "economy: { graphMb: 64, edgeMb: 16, silhouetteMb: 32, sourceMb: 64, supersedeWindowMs: 650 }")
change('src/editor/effects-worker-client.ts',"balanced: { graphMb: 192, edgeMb: 64, silhouetteMb: 80, supersedeWindowMs: 450 }", "balanced: { graphMb: 192, edgeMb: 64, silhouetteMb: 80, sourceMb: 128, supersedeWindowMs: 450 }")
change('src/editor/effects-worker-client.ts',"responsive: { graphMb: 384, edgeMb: 160, silhouetteMb: 192, supersedeWindowMs: 220 }", "responsive: { graphMb: 384, edgeMb: 160, silhouetteMb: 192, sourceMb: 256, supersedeWindowMs: 220 }")
change('src/editor/effects-worker.ts', 'graphMb?: number; edgeMb?: number; silhouetteMb?: number;', 'graphMb?: number; edgeMb?: number; silhouetteMb?: number; sourceMb?: number;')
change('src/editor/effects-worker.ts', 'const MAX_SOURCES = 3;\nconst MAX_SOURCE_BYTES = 96 * 1024 * 1024;', '''// All cache budgets are bounded and can be changed without restarting the worker.
const MAX_SOURCES = 8;
let sourceBudgetBytes = 128 * 1024 * 1024;
function evictSources(protectedId?: number): number[] {
  let bytes = 0;
  for (const image of sources.values()) bytes += image.width * image.height * 4;
  const evicted: number[] = [];
  while ((sources.size > MAX_SOURCES || bytes > sourceBudgetBytes) && sources.size > 1) {
    const oldest = [...sources.keys()].find(id => id !== protectedId);
    if (oldest === undefined) break;
    const image = sources.get(oldest)!;
    bytes -= image.width * image.height * 4;
    sources.delete(oldest);
    stackCache.clearSource(oldest);
    newestRequest.delete(oldest);
    evicted.push(oldest);
  }
  return evicted;
}''')
change('src/editor/effects-worker.ts', '''    setSilhouetteCacheBudget(event.data.silhouetteMb ?? 80);
    return;''', '''    setSilhouetteCacheBudget(event.data.silhouetteMb ?? 80);
    sourceBudgetBytes = Math.max(32, Math.min(1024, event.data.sourceMb ?? 128)) * 1024 * 1024;
    const evicted = evictSources();
    if (evicted.length) scope.postMessage({ kind: 'evicted', evicted });
    return;''')
start='''      let bytes = 0;
      for (const entry of sources.values()) bytes += entry.width * entry.height * 4;
      while (sources.size > MAX_SOURCES || bytes > MAX_SOURCE_BYTES) {
        if (sources.size === 1) break;
        const oldest = sources.keys().next().value as number;
        const removed = sources.get(oldest)!;
        sources.delete(oldest);
        stackCache.clearSource(oldest);
        newestRequest.delete(oldest);
        evicted.push(oldest);
        bytes -= removed.width * removed.height * 4;
      }'''
change('src/editor/effects-worker.ts',start,'''      evicted.push(...evictSources(sourceId));''')
# Explicit eviction message should not interfere with render completion because it has no job id.
change('src/editor/effects-worker-client.ts', '''    for (const sourceId of event.data.evicted ?? []) residentSources.delete(sourceId);
    const finished = running;''', '''    for (const sourceId of event.data.evicted ?? []) residentSources.delete(sourceId);
    if ((event.data as {kind?: string}).kind === 'evicted') return;
    const finished = running;''')
# AG: keyframe interpolation saved as optional field; old documents remain identical.
change('src/editor/creative.ts', '''export interface CreativeKeyframe {
  frame: number;
  value: number | string;
}''','''export type CreativeInterpolation = 'linear' | 'hold' | 'easeInOut';
export interface CreativeKeyframe {
  frame: number;
  value: number | string;
  /** Segment interpolation toward the next keyframe; old tracks default to linear. */
  interpolation?: CreativeInterpolation;
}''')
change('src/editor/creative.ts', '''    const alpha = (frame - left.frame) / Math.max(1, right.frame - left.frame);''','''    const fraction = (frame - left.frame) / Math.max(1, right.frame - left.frame);
    const alpha = left.interpolation === 'hold' ? 0 : left.interpolation === 'easeInOut'
      ? fraction * fraction * (3 - 2 * fraction) : fraction;''')
change('src/editor/creative.ts', '''  object.tracks[property] = [...(object.tracks[property] ?? []).filter(item => item.frame !== frame), { frame, value }]
    .sort((a, b) => a.frame - b.frame);''','''  const existing = object.tracks[property]?.find(item => item.frame === frame);
  object.tracks[property] = [...(object.tracks[property] ?? []).filter(item => item.frame !== frame),
    { frame, value, ...(existing?.interpolation ? {interpolation:existing.interpolation} : {}) }]
    .sort((a, b) => a.frame - b.frame);''')
change('src/editor/creative.ts', '''item.frame >= 0 && item.frame < 1000 &&
          (safe(item.value)''','''item.frame >= 0 && item.frame < 1000 &&
          (item.interpolation === undefined || ['linear', 'hold', 'easeInOut'].includes(item.interpolation)) &&
          (safe(item.value)''')
# AE: correct header version (was badge 0.1)
change('src/App.tsx','<span className="badge">0.1</span>','<span className="badge">0.2</span>')

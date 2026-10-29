/** Model-free gradient palette sampling shared by preview, canvas and exports.
 * The color modes describe how palette entries are chosen; they do not create
 * raster layers, change the source gradient, or alter existing smooth projects. */
export const GRADIENT_COLOR_MODES = [
  { id: 'smooth', label: 'Smooth', detail: 'Blend naturally between your color stops.' },
  { id: 'hardStops', label: 'Hard stops', detail: 'Hold each stop color until the next stop.' },
  { id: 'bands', label: 'Bands', detail: 'Repeat the complete color ramp as sharp bands.' },
  { id: 'alternating', label: 'Alternating', detail: 'Switch cleanly between two colors.' },
  { id: 'stepped', label: 'Stepped', detail: 'Posterize the gradient into solid color steps.' },
  { id: 'pattern', label: 'Pattern palette', detail: 'Cycle each of your chosen colors without blending.' },
] as const;
export type GradientColorMode = typeof GRADIENT_COLOR_MODES[number]['id'];
export const GRADIENT_PATTERNS = [
  { id: 'smooth', label: 'No pattern', detail: 'A conventional gradient with optional color bands.' },
  { id: 'sunburst', label: 'Radial sunburst', detail: 'Precisely repeated rays from an editable focal point.' },
  { id: 'speedlines', label: 'Anime speed lines', detail: 'Tapered radial lines with optional fine streaks.' },
] as const;

export interface CompiledStop { position: number; color: number[]; alpha: number }
export type RGBA = [number, number, number, number];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const fract = (n: number) => n - Math.floor(n);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function paletteSample(stops: CompiledStop[], fraction: number, mode: GradientColorMode = 'smooth', count = 8): RGBA {
  const n = stops.length;
  if (!n) return [0,0,0,255];
  if (n === 1) return [...stops[0].color.slice(0,3),stops[0].alpha] as RGBA;
  const t = clamp(fraction);
  const bands = Math.max(2, Math.min(256, Math.round(count)));
  if (mode === 'alternating') return stopRGBA(stops[Math.min(n-1,Math.floor(t * bands) % 2 === 0 ? 0 : n-1)]);
  if (mode === 'pattern') return stopRGBA(stops[Math.min(n-1, Math.floor(t * bands) % n)]);
  if (mode === 'bands') {
    const stripe = Math.min(bands - 1, Math.floor(t * bands));
    // Bands repeat palette stops in order instead of interpolating their colors.
    const index = stripe % n;
    return stopRGBA(stops[index]);
  }
  const lookup = mode === 'stepped' ? Math.floor(t * bands) / bands : t;
  if (mode === 'hardStops') {
    // Assign each interval to the nearest stop. With two endpoint stops the
    // boundary falls at the midpoint, not at the very last document pixel.
    for (let i=0; i<n-1; i++) if (lookup < (stops[i].position+stops[i+1].position)*.5) return stopRGBA(stops[i]);
    return stopRGBA(stops[n-1]);
  }
  let a=stops[0],b=stops[n-1];
  if (lookup <= a.position) b=a;
  else if (lookup >= b.position) a=b;
  else for (let i=1;i<n;i++) if(lookup <= stops[i].position) { a=stops[i-1];b=stops[i];break; }
  const blend=a===b?0:clamp((lookup-a.position)/Math.max(1e-8,b.position-a.position));
  return [mix(a.color[0],b.color[0],blend),mix(a.color[1],b.color[1],blend),
    mix(a.color[2],b.color[2],blend),mix(a.alpha,b.alpha,blend)];
}
function stopRGBA(s: CompiledStop): RGBA {return [s.color[0],s.color[1],s.color[2],s.alpha];}

/** Fractional position around each repeating ray pair. The angle is calculated
 * in actual pixel coordinates, so square and widescreen documents agree. */
export function radialRayCoordinate(x: number, y: number, options: {
  centerX: number; centerY: number; width: number; height: number;
  rayPairs: number; rotation: number; twist: number; scale: number;
}): { fraction: number; index: number; radius: number } {
  const dx=(x-options.centerX)*Math.max(1,options.width);
  const dy=(y-options.centerY)*Math.max(1,options.height);
  const r=Math.hypot(dx,dy);
  const radius=r / Math.max(1,Math.hypot(options.width,options.height)*.5*options.scale);
  const angle=Math.atan2(dy,dx)/(Math.PI*2);
  const position=(angle+options.rotation/360+options.twist*radius*.125)*Math.max(2,Math.min(180,Math.round(options.rayPairs)));
  const index=Math.floor(position);
  return {fraction:fract(position),index,radius};
}
/** Anti-aliased coverage for a ray wedge. With edgeSoftness = 0 its geometry
 * is mathematically hard (black and white rays never interpolate). */
export function rayCoverage(fraction: number, width: number, softness: number): number {
  const w=Math.max(.02,Math.min(.98,width));
  const soft=Math.max(0,Math.min(.48,softness))*.5;
  if (soft < .000001) return fraction < w ? 1 : 0;
  const smoothstep=(lo:number,hi:number,t:number) => { const a=clamp((t-lo)/Math.max(1e-8,hi-lo));return a*a*(3-2*a); };
  return smoothstep(0,soft,fraction)*(1-smoothstep(w-soft,w+soft,fraction));
}

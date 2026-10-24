/**
 * Low-latency, full-size Studio *draft* renderer.
 *
 * The canonical algorithms still execute in the worker (and for export).
 * A several-hundred-millisecond CPU filter cannot generate 60 distinct exact
 * bitmaps per second. While dragging, stream any number of enabled GPU passes
 * through reusable textures instead of imposing an arbitrary stack cutoff. On release the exact
 * worker result replaces the draft. This module never touches document pixels.
 *
 * Drafts approximate expensive effects, especially stylization and complex
 * signature FX. They must not be saved or exported as final effect output.
 */
import type { Effect } from './types';
import { isColorLutEffect, buildColorLut, COLOR_LUT_SIZE } from './live-color-lut';

const GROUPS: Record<string, number> = {
  // 1: convolution / defocus; 2: silhouette outline; 3: luminous diffusion
  blur: 1, boxblur: 1, motionblur: 1, radialblur: 1, lensblur: 1,
  surfaceblur: 1, frosted: 1, denoise: 1,
  outline: 2, sig_0: 2, neonedge: 2, sig_11: 2,
  glow: 3, radiance: 3, sig_1: 3, sig_3: 3, sig_7: 3,
  // 4: chromatic channels; 5: analog/electronic corruption; 6: distortions
  chromatic: 4, sig_8: 4, holographic: 4, sig_12: 4,
  glitch: 5, vhs: 5, crt: 5, sig_4: 5, sig_13: 5,
  zoomblur: 6, swirl: 6, ripple: 6, wave: 6, glass: 6,
  // 7: block / quantization; 8: illustrated/ink; 9: edge falloff
  pixelate: 7, mosaic: 7, posterize: 7, halftone: 7, dither: 7,
  cartoon: 8, sketch: 8, ink: 8, comicink: 8, sig_5: 8,
  vignette: 9,
  // Painterly filters need their own anchored local-color reconstruction.
  // Routing them through comic posterization caused disappearing regions and
  // a visibly different final image whenever the exact worker finished.
  oilpaint: 16, watercolor: 17,
  // 10: grain; 11: shadow and darkness; 12: edge enhancement
  grain: 10, noise: 10,
  shadow: 11, miasma: 11, sig_2: 11,
  sharpen: 12, unsharp: 12, highpass: 12, clarity: 12, texture: 12,
  edges: 12, emboss: 12,
  // 13: ambient light and generated color; 14: photographic adjustments
  aurora: 13, burst: 13, backdrop: 13, sig_6: 13, sig_9: 13,
  sig_10: 13, sig_14: 13,
  cutout: 15,
  brightness: 14, contrast: 14, saturate: 14, hue: 14, grayscale: 14,
  sepia: 14, invert: 14,
  exposure: 14, highlights: 14, shadows: 14, whites: 14, blacks: 14,
  temperature: 14, tint: 14, vibrance: 14, gamma: 14,
  curves: 14, levels: 14, balance: 14, selective: 14,
  mixer: 14, gradientmap: 14, duotone: 14, solarize: 14,
};

export function gpuPreviewSupport(effects: readonly Effect[]): boolean {
  // GPU passes are streamed through two reusable framebuffers. There is no
  // arbitrary 4/5-effect cutoff: the only limits are GPU texture capacity and
  // the hardware's actual processing throughput.
  return effects.some(effect => effect.enabled) && effects.every(effect => !effect.enabled || Boolean(GROUPS[effect.kind]));
}

function color(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number];
}

const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0,
                (gl_VertexID == 1) ? 3.0 : -1.0);
  uv = (p + 1.0) * .5;
  gl_Position = vec4(p, 0., 1.);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 pixel;
uniform sampler2D image;
uniform highp sampler3D colorLut;
uniform int mode;
uniform float strength;
uniform float amount;
uniform vec2 dimensions;
uniform vec4 params;
uniform vec3 colorA;
uniform vec3 colorB;
uniform int variant;
uniform vec4 glowSettings; // softness, spread, falloff, opacity
uniform int glowMode; // 0=outer, 1=inner, 2=both, 3=bloom
vec2 safe(vec2 p) { return clamp(p, vec2(.00001), vec2(.99999)); }
// Samples outside the document are transparent, not a stretched edge pixel.
// This is essential for alpha silhouettes, text and correct glow boundaries.
vec4 pick(vec2 p) {
  if (any(lessThan(p, vec2(0.))) || any(greaterThan(p, vec2(1.)))) return vec4(0.);
  return texture(image, safe(p));
}
// Add a behind-the-object halo without ever moving, resizing, or recoloring
// the opaque pixels of the original object. All operations use straight alpha.
vec4 under(vec4 source, vec3 tint, float halo) {
  halo = clamp(halo, 0., 1.);
  float a = source.a + (1. - source.a) * halo;
  vec3 premul = source.rgb * source.a + tint * halo * (1. - source.a);
  return vec4(a > 0.00001 ? premul / a : vec3(0.), a);
}
float rand(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
float lum(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
vec4 blur(vec2 p, vec2 delta) {
  vec4 sum = pick(p) * .227027;
  sum += (pick(p + delta * 1.3846) + pick(p - delta * 1.3846)) * .316216;
  sum += (pick(p + delta * 3.2308) + pick(p - delta * 3.2308)) * .070270;
  return sum;
}
void main() {
  vec2 stepPx = 1. / dimensions;
  vec2 center = vec2(.5);
  vec2 p = uv;
  float s = clamp(strength, -2., 3.);
  vec4 src = pick(p);
  vec4 outputColor = src;
  if (mode == 1) {
    // Bounded five-tap axis kernel: constant cost even at the maximum radius.
    float radius = max(0., amount) * .46;
    vec2 axis = vec2(1., 0.);
    if (variant == 1 || variant == 2) axis = normalize(vec2(cos(radians(params.x)), sin(radians(params.x))));
    if (variant == 3) axis = normalize(vec2(-p.y + .5, p.x - .5) + vec2(.0001));
    vec4 a = blur(p, axis * radius * stepPx);
    vec4 b = blur(p, vec2(-axis.y, axis.x) * radius * stepPx);
    outputColor = mix(src, .5 * (a + b), clamp(.45 + s * .6, 0., 1.));
  } else if (mode == 2) {
    float radius = max(0., amount * (variant == 1 ? .16 : .32));
    vec2 dx = vec2(stepPx.x * radius, 0.);
    vec2 dy = vec2(0., stepPx.y * radius);
    float nearby = max(max(pick(p+dx).a,pick(p-dx).a),max(pick(p+dy).a,pick(p-dy).a));
    nearby = max(nearby, max(max(pick(p+dx+dy).a,pick(p+dx-dy).a),
      max(pick(p-dx+dy).a,pick(p-dx-dy).a)));
    float outer = clamp(nearby - src.a, 0., 1.) * clamp(s,0.,1.);
    float edge = max(max(abs(lum(src.rgb)-lum(pick(p+dx).rgb)),abs(lum(src.rgb)-lum(pick(p-dx).rgb))),
                     max(abs(lum(src.rgb)-lum(pick(p+dy).rgb)),abs(lum(src.rgb)-lum(pick(p-dy).rgb))));
    // For fully opaque photos, trace internal contrast edges. But never
    // replace the subject itself with a larger or displaced image.
    float photoContour = smoothstep(.12, .48, edge) * src.a * (1. - nearby + .45);
    outputColor = under(src, colorA, max(outer, photoContour * .4 * clamp(s,0.,1.)));
    outputColor.rgb = mix(outputColor.rgb, colorA, photoContour * .46 * clamp(s,0.,1.));
  } else if (mode == 3) {
    // A continuous halo around the *unchanged* silhouette. The previous
    // implementation sampled just one far-away ring: at large radii that
    // appeared as eight displaced copies of the layer instead of a glow.
    float radiusPx = max(1., amount * .65 + glowSettings.x * .5 + glowSettings.y);
    float falloff = max(.2, glowSettings.z);
    float spread = clamp(glowSettings.y / max(1., radiusPx), 0., 1.);
    float weighted = src.a * .24;
    float weightSum = .24;
    for (int ring = 1; ring <= 3; ring++) {
      float fraction = float(ring) / 3.;
      float distancePx = radiusPx * fraction;
      float w = exp(-falloff * fraction * fraction * .4) * (1. + spread);
      vec2 horizontal = stepPx * distancePx;
      weighted += w * (
        pick(p + vec2( horizontal.x, 0.)).a + pick(p + vec2(-horizontal.x, 0.)).a +
        pick(p + vec2(0.,  horizontal.y)).a + pick(p + vec2(0., -horizontal.y)).a +
        pick(p + horizontal * .7071068).a + pick(p - horizontal * .7071068).a +
        pick(p + horizontal * vec2(.7071068, -.7071068)).a +
        pick(p + horizontal * vec2(-.7071068, .7071068)).a
      );
      weightSum += w * 8.;
    }
    float halo = weighted / max(.0001, weightSum);
    float power = clamp(s,0.,1.) * clamp(glowSettings.w,0.,1.);
    float outer = halo * (1. - src.a) * power;
    float inner = (1. - halo) * src.a * power;
    vec3 tint = variant == 4 ? mix(colorA, colorB, smoothstep(-3.1416,3.1416,
      atan(p.y-.5,p.x-.5))) : colorA;
    if (glowMode == 3) { // Bloom bright original pixels, not an outer silhouette
      float bright = smoothstep(.35,.95,lum(src.rgb));
      outputColor = vec4(clamp(src.rgb + tint * halo * bright * power,0.,1.), src.a);
    } else {
      if (glowMode == 1) outer = 0.;
      outputColor = under(src, tint, outer);
      if (glowMode == 1 || glowMode == 2)
        outputColor.rgb = mix(outputColor.rgb, tint, inner * .6);
    }
  } else if (mode == 4) {
    vec2 offset = vec2(amount * stepPx.x * .55, params.y * stepPx.y * .5);
    vec3 left = pick(p - offset).rgb;
    vec3 right = pick(p + offset).rgb;
    float mixColor = clamp(params.x,0.,1.);
    vec3 separated = vec3(left.r, src.g, right.b);
    separated = mix(separated, left * colorA + right * colorB, mixColor * .5);
    outputColor.rgb = mix(src.rgb, clamp(separated,0.,1.),clamp(s,0.,1.));
  } else if (mode == 5) {
    // VHS and glitch operate in canvas pixel coordinates. The source never
    // jumps or disappears; displaced channels are blended over the exact
    // original alpha with a deterministic per-row seed.
    float row = floor(p.y * dimensions.y / 9.);
    float seeded = rand(vec2(row, params.w));
    float tear = (seeded - .5) * stepPx.x * max(0., amount) * .3;
    float stripeActive = step(.66, rand(vec2(row, params.w + 11.)));
    vec2 disp = p + vec2(tear * stripeActive, 0.);
    float shift = max(0., amount) * .20 * stepPx.x;
    vec4 left = pick(disp - vec2(shift, 0.));
    vec4 right = pick(disp + vec2(shift, 0.));
    float strengthValue = clamp(s,0.,1.);
    float tintStrength = clamp(params.x,0.,1.) * strengthValue * .48;
    vec3 tinted = src.rgb * (1.-tintStrength) +
       .5 * (left.rgb * colorA + right.rgb * colorB) * tintStrength;
    float scan = 1. - .12 * strengthValue * step(.5, fract(p.y * dimensions.y / 3.));
    outputColor = vec4(mix(src.rgb, tinted * scan, strengthValue), src.a);
  } else if (mode == 6) {
    vec2 v = p-center;
    float radius = length(v);
    float warp = clamp(s,-1.,1.) * .42;
    float angle = warp * (1. - smoothstep(.0,.7,radius)) * 3.4;
    float waves = sin(radius * 68. + params.x * .12) * warp * .006;
    float cs = cos(angle), sn = sin(angle);
    vec2 rotated = vec2(v.x*cs-v.y*sn,v.x*sn+v.y*cs);
    outputColor = pick(center + rotated*(1. + waves));
  } else if (mode == 7) {
    float cells = max(1., amount);
    vec2 q = floor(p * dimensions / cells) * cells / dimensions + cells * .5 / dimensions;
    vec4 pixelated = pick(q);
    float levels = max(2., amount * .48);
    vec4 banded = vec4(floor(src.rgb * (levels-1.)+.5)/(levels-1.),src.a);
    outputColor = variant == 1 ? banded : pixelated;
  } else if (mode == 8) {
    vec2 dx = vec2(stepPx.x*2.,0.),dy = vec2(0.,stepPx.y*2.);
    float edge = abs(lum(pick(p+dx).rgb)-lum(pick(p-dx).rgb))+
                 abs(lum(pick(p+dy).rgb)-lum(pick(p-dy).rgb));
    float black = smoothstep(.08,.38,edge);
    vec3 poster = floor(src.rgb * 5. + .5) / 5.;
    vec3 comic = mix(poster, vec3(.02,.02,.04),black);
    vec3 charcoal = vec3(1. - clamp(edge*3.,0.,1.));
    outputColor.rgb = mix(src.rgb,variant == 1 ? charcoal : comic,clamp(s,0.,1.));
  } else if (mode == 9) {
    vec2 v = (p - vec2(.5))*2.;
    float falloff = 1.-smoothstep(.28,1.45,length(v));
    outputColor.rgb = src.rgb * mix(1.,falloff,clamp(s,0.,1.));
  } else if (mode == 10) {
    float grain = (rand(p*dimensions/max(1.,params.x+1.)+params.w)-.5)*.42*s;
    outputColor.rgb = clamp(src.rgb + grain,0.,1.);
  } else if (mode == 11) {
    vec2 delta = vec2(11.,18.) * stepPx * clamp(s,0.,1.);
    // A shadow appears BEHIND the original subject, not in its place.
    float shadow = (pick(p - delta).a + pick(p - delta + stepPx * vec2(amount*.2,0.)).a +
      pick(p - delta - stepPx * vec2(amount*.2,0.)).a) / 3.;
    float power = shadow * clamp(s,0.,1.) * .72;
    outputColor = under(src, colorA, power);
  } else if (mode == 12) {
    vec3 around = (pick(p+stepPx*vec2(1.,0.)).rgb+pick(p-stepPx*vec2(1.,0.)).rgb+
      pick(p+stepPx*vec2(0.,1.)).rgb+pick(p-stepPx*vec2(0.,1.)).rgb)*.25;
    outputColor.rgb = clamp(src.rgb+(src.rgb-around)*s*2.,0.,1.);
  } else if (mode == 13) {
    float ray = sin(atan(p.y-.5,p.x-.5)*max(4.,params.x)+length(p-center)*24.);
    float mist = .5+.5*sin(p.x*17.+p.y*12.+params.w);
    float glow = max(.0,ray*.25+.35*mist)*clamp(s,0.,1.);
    outputColor.rgb = 1.-(1.-src.rgb)*(1.-mix(colorA,colorB,mist)*glow);
  } else if (mode == 14) {
    // Precise color-only adjustments come from the same canonical CPU
    // processor as export, sampled through a trilinear 3D LUT. This is no
    // longer a fake contrast filter shared by curves, selective color, etc.
    vec3 rgb = clamp(src.rgb,0.,1.);
    vec3 position = (rgb * float(19 - 1) + .5) / float(19);
    outputColor = vec4(texture(colorLut, position).rgb, src.a);
  } else if (mode == 15) {
    vec3 background = (pick(vec2(.002,.002)).rgb+pick(vec2(.998,.002)).rgb+
      pick(vec2(.002,.998)).rgb+pick(vec2(.998,.998)).rgb)*.25;
    float tolerance = max(.001, amount / 255.);
    float dist = distance(src.rgb,background);
    float mask = smoothstep(tolerance*.65,tolerance*1.3,dist);
    outputColor = vec4(src.rgb,src.a*mask);
  } else if (mode == 16) {
    // Oil Painting: local, canvas-anchored brush-color reconstruction. Its
    // sampling grid is NEVER offset, so the painted subject cannot rise,
    // shrink, or move when the user touches the strength slider.
    float brush = max(2., params.z);
    vec2 pixelPosition = p * dimensions;
    vec2 cell = floor(pixelPosition / brush);
    vec2 center = (cell + vec2(.5)) * brush / dimensions;
    vec2 direction = vec2(cos(dot(cell,vec2(.071,.043))),sin(dot(cell,vec2(.071,.043))));
    vec4 pooled = (pick(center) * .44 +
      pick(center + direction * brush * stepPx * .45) * .28 +
      pick(center - direction * brush * stepPx * .45) * .28);
    // Preserve the object's original alpha and silhouette rather than
    // painting a shifted opaque rectangle over the document.
    float grain = rand(cell + vec2(12., 19.)) - .5;
    vec3 pigment = clamp(pooled.rgb + grain * .08 * clamp(params.y,0.,1.),0.,1.);
    vec2 within = (pixelPosition - (cell+.5)*brush)/brush;
    float angle = sin(dot((cell+.5)*brush,vec2(.071,.043)));
    vec2 rotated = vec2(within.x*cos(angle)+within.y*sin(angle),
      -within.x*sin(angle)+within.y*cos(angle));
    float dab = (1.-smoothstep(.64,.87,abs(rotated.x))) *
      (1.-smoothstep(.15,.35,abs(rotated.y)));
    outputColor = vec4(mix(src.rgb,pigment,clamp(s,0.,1.)*.92*dab),src.a);
  } else if (mode == 17) {
    // Watercolor has color bleeding and paper wash rather than oil strokes.
    float diffusion = max(2.,params.z);
    vec2 d = diffusion * stepPx;
    vec4 wash = (src * .40 + pick(p+d*vec2(1.,.3)) * .15 +
      pick(p+d*vec2(-.4,1.)) * .15 + pick(p-d*vec2(1.,.3)) * .15 +
      pick(p-d*vec2(-.4,1.)) * .15);
    float paper = (rand(floor(p*dimensions*1.7))- .5)* .055;
    outputColor = vec4(mix(src.rgb, clamp(wash.rgb+paper,0.,1.), clamp(s,0.,1.)),src.a);
  }
  pixel = clamp(outputColor,0.,1.);
}`;

class PreviewPipeline {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private original: WebGLTexture;
  private ping: WebGLTexture[];
  private buffers: WebGLFramebuffer[];
  private uploaded: HTMLCanvasElement | null = null;
  private frameWidth = 0;
  private frameHeight = 0;
  private lost = false;
  private previousSignatures: string[] = [];
  // A single retained GPU prefix speeds repeated changes to a later effect.
  // This is one native-resolution surface, not one texture per applied effect.
  private prefix: { texture: WebGLTexture; index: number; signatures: string[] } | null = null;
  private maxTextureSize: number;
  private uniforms: Record<'mode'|'variant'|'strength'|'amount'|'dimensions'|'params'|'colorA'|'colorB'|'glowSettings'|'glowMode', WebGLUniformLocation | null>;
  // One persistent LUT texture per effect ID. Previous code had ONE global
  // LUT texture, so editing the last step forced *every unchanged Color &
  // Light filter before it* to regenerate on every frame.
  private colorLuts = new Map<string, { texture: WebGLTexture; signature: string }>();

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false,
      antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('WebGL shader allocation failed');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed');
      return shader;
    };
    const v = compile(gl.VERTEX_SHADER,vertex), f=compile(gl.FRAGMENT_SHADER,fragment);
    const prog=gl.createProgram();
    if (!prog) throw new Error('WebGL program allocation failed');
    gl.attachShader(prog,v); gl.attachShader(prog,f); gl.linkProgram(prog);
    gl.deleteShader(v);gl.deleteShader(f);
    if (!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Link failed');
    this.program=prog;
    this.uniforms = Object.fromEntries((['mode','variant','strength','amount','dimensions','params','colorA','colorB','glowSettings','glowMode'] as const)
      .map(name=>[name,gl.getUniformLocation(prog,name)])) as typeof this.uniforms;
    const original=gl.createTexture(), ping=gl.createTexture(),pong=gl.createTexture(),
      fb0=gl.createFramebuffer(),fb1=gl.createFramebuffer();
    if (!original||!ping||!pong||!fb0||!fb1) throw new Error('WebGL texture allocation failed');
    this.original=original;this.ping=[ping,pong];this.buffers=[fb0,fb1];
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog,'image'),0);
    gl.uniform1i(gl.getUniformLocation(prog,'colorLut'),1);
    this.canvas.addEventListener('webglcontextlost',event=>{ event.preventDefault();this.lost=true; });
  }

  private allocate(width:number,height:number): void {
    const gl=this.gl;
    if (this.prefix) gl.deleteTexture(this.prefix.texture);
    this.canvas.width=width;this.canvas.height=height;
    this.frameWidth=width;this.frameHeight=height;
    this.uploaded=null;
    this.previousSignatures = [];
    this.prefix = null;
    for (let i=0;i<2;i++) {
      gl.bindTexture(gl.TEXTURE_2D,this.ping[i]);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.buffers[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.ping[i],0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('WebGL framebuffer incomplete');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  render(source:HTMLCanvasElement,effects: readonly Effect[]):HTMLCanvasElement|null {
    const gl=this.gl;
    if (this.lost || !gpuPreviewSupport(effects) || source.width < 1 || source.height < 1 ||
      source.width > this.maxTextureSize || source.height > this.maxTextureSize) return null;
    if (this.frameWidth!==source.width || this.frameHeight!==source.height) this.allocate(source.width,source.height);
    gl.viewport(0,0,source.width,source.height);
    gl.useProgram(this.program);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    if (this.uploaded!==source) {
      if (this.prefix) gl.deleteTexture(this.prefix.texture);
      gl.bindTexture(gl.TEXTURE_2D,this.original);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      this.uploaded=source;
      this.previousSignatures = [];
      this.prefix = null;
    }
    const enabled=effects.filter(effect=>effect.enabled);
    const signatures = enabled.map(effect => JSON.stringify(effect));
    const firstChanged = signatures.findIndex((value, index) => this.previousSignatures[index] !== value);
    // The same presentation frame might be requested more than once. Preserve
    // the last completed canvas instead of scheduling redundant GPU passes.
    if (firstChanged < 0 && signatures.length === this.previousSignatures.length) return this.canvas;
    const cachedStart = this.prefix && this.prefix.index < firstChanged &&
      this.prefix.signatures.every((value, i) => value === signatures[i])
        ? this.prefix.index + 1 : 0;
    // If an effect is removed/disabled, a cached prefix might cover the
    // entire shorter stack. Recompute rather than returning the old image.
    const start = cachedStart < enabled.length ? cachedStart : 0;
    const saveAt = firstChanged > 0 ? firstChanged - 1 : Math.max(-1, enabled.length - 2);
    let cachedTexture = start > 0 ? this.prefix?.texture ?? this.original : this.original;
    enabled.forEach((effect,index)=>{
      if (index < start) return;
      const mode=GROUPS[effect.kind];
      if (mode === 14 && isColorLutEffect(effect.kind)) {
        const signature = JSON.stringify(effect);
        let entry = this.colorLuts.get(effect.id);
        if (!entry) {
          const texture = gl.createTexture();
          if (!texture) throw new Error('Unable to allocate a color-adjustment LUT');
          entry = { texture, signature: '' };
        }
        // Move to the back to retain recently active steps.
        this.colorLuts.delete(effect.id);
        this.colorLuts.set(effect.id, entry);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, entry.texture);
        if (entry.signature !== signature) {
          const lut = buildColorLut(effect);
          gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
            gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, COLOR_LUT_SIZE, COLOR_LUT_SIZE,
            COLOR_LUT_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
          entry.signature = signature;
        }
        gl.activeTexture(gl.TEXTURE0);
        while (this.colorLuts.size > 64) {
          const oldest = this.colorLuts.entries().next().value as [string, { texture: WebGLTexture; signature: string }];
          this.colorLuts.delete(oldest[0]);
          gl.deleteTexture(oldest[1].texture);
        }
      }
      const p=effect.parameters as Record<string,unknown> | undefined;
      const value=(key:string,fallback:number):number=>typeof p?.[key]==='number'&&Number.isFinite(p[key]) ? p[key] as number : fallback;
      const e=effect.kind;
      const strength= ['blur','boxblur','motionblur','radialblur','lensblur','surfaceblur','frosted',
        'outline','shadow','chromatic','pixelate','mosaic','posterize','halftone',
        'swirl','wave','ripple','glass','zoomblur'].includes(e) ? Math.min(1,Math.abs(effect.amount)/65) : effect.amount/100;
      const variant = mode===1 ? (e==='motionblur'?1:e==='radialblur'?3:0)
        : mode===3 ? (e==='glow' && p?.glowPalette === 'spectrum' ? 4 : 0)
        : mode===7 ? (e==='posterize'||e==='dither'?1:0)
          : mode===8 ? (e==='sketch'||e==='ink'||e==='comicink'?1:0)
            : mode===14 ? (e==='exposure'?1:e==='gamma'?2:e==='gradientmap'||e==='duotone'?3:e==='temperature'?4:0) : 0;
      const first=color(p?.colorA ?? effect.color,[.62,.38,1]);
      const second=color(p?.colorB ?? (e==='glow' && p?.glowPalette==='spectrum' && Array.isArray(p?.stops) ? (p.stops as Array<{color:string}>).at(-1)?.color : undefined),[.2,.78,1]);
      gl.uniform1i(this.uniforms.mode,mode);
      gl.uniform1i(this.uniforms.variant,variant);
      gl.uniform1f(this.uniforms.strength,strength);
      gl.uniform1f(this.uniforms.amount,effect.amount);
      gl.uniform2f(this.uniforms.dimensions,source.width,source.height);
      gl.uniform4f(this.uniforms.params,value('colorMix',65)/100,
        value('texture',55)/100, e==='oilpaint' ? value('brushSize',4) : e==='watercolor' ? value('diffusion',7) : value('radius',12), value('seed',17));
      gl.uniform3fv(this.uniforms.colorA,first);
      gl.uniform3fv(this.uniforms.colorB,second);
      const haloKind = String(p?.glowMode ?? 'outer');
      gl.uniform1i(this.uniforms.glowMode,
        haloKind === 'inner' ? 1 : haloKind === 'both' ? 2 : haloKind === 'bloom' ? 3 : 0);
      gl.uniform4f(this.uniforms.glowSettings,
        value('softness',24),value('spread',0),.6 + value('falloff',55)/100*3,
        value('opacity',75)/100);
      gl.bindTexture(gl.TEXTURE_2D,index===start?cachedTexture:this.ping[(index-1)%2]);
      const final=index===enabled.length-1;
      gl.bindFramebuffer(gl.FRAMEBUFFER,final?null:this.buffers[index%2]);
      gl.drawArrays(gl.TRIANGLES,0,3);
      // Preserve exactly one unchanged prefix so dragging a fifth (or 25th)
      // effect doesn't recompute every earlier stage at display refresh rate.
      if (index === saveAt && !final) {
        let texture = this.prefix?.texture;
        if (!texture) {
          texture = gl.createTexture() ?? undefined;
          if (!texture) throw new Error('Cannot allocate cached GPU effect prefix');
          gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        }
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,source.width,source.height);
        this.prefix = {texture,index,signatures:signatures.slice(0,index+1)};
      }
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    this.previousSignatures = signatures;
    return this.canvas;
  }
}

let engine:PreviewPipeline|null=null;
let disabled=false;
/** Returns true only when a genuinely new, full-size GPU draft was drawn. */
export function paintGpuEffectDraft(target:CanvasRenderingContext2D,source:HTMLCanvasElement,effects:readonly Effect[],width:number,height:number):boolean {
  if (disabled || !gpuPreviewSupport(effects) || typeof document==='undefined') return false;
  try {
    engine ??= new PreviewPipeline();
    const canvas=engine.render(source,effects);
    if (!canvas) return false;
    target.drawImage(canvas,0,0,width,height);
    return true;
  } catch {
    // A renderer failure must never corrupt an export or block the pointer.
    disabled=true;
    return false;
  }
}

// Windows with WebGL2 uses all enabled GPU passes in document order. WebViews
// without it also keep the entire effect stack and order; they may be slower,
// but must never replace an existing stack with one unrelated effect.
const fallbackTile: { canvas?: HTMLCanvasElement } = {};
const previousDraftSettings = new WeakMap<HTMLCanvasElement, Map<string, string>>();
/** On a multi-effect layer the edited item might not be the last one. */
export function changedDraftEffect(source: HTMLCanvasElement, effects: readonly Effect[]): Effect | undefined {
  const previous = previousDraftSettings.get(source);
  const next = new Map<string, string>();
  let changed: Effect | undefined;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const signature = JSON.stringify(effect);
    next.set(effect.id, signature);
    if (previous && previous.get(effect.id) !== signature) changed = effect;
  }
  previousDraftSettings.set(source, next);
  return changed ?? [...effects].reverse().find(effect => effect.enabled);
}
/** Fast and non-destructive interactive approximation when WebGL2 is blocked. */
function paintSingleCanvasEffect(target:CanvasRenderingContext2D,source:HTMLCanvasElement,e:Effect,width:number,height:number):boolean {
  const mode=GROUPS[e.kind];
  if (!mode) return false;
  const a=e.amount;
  const p=e.parameters as Record<string,unknown> | undefined;
  const numeric=(key:string,def=0):number => typeof p?.[key]==='number' && Number.isFinite(p[key]) ? p[key] as number : def;
  const glowColor=typeof e.color==='string'&&/^#[0-9a-f]{6}$/i.test(e.color)?e.color:'#916bff';
  target.save();
  const draw=():void=>{target.drawImage(source,0,0,width,height);};
  const amount=Math.abs(a);
  // Seven simple color adjustments have a native Canvas2D representation.
  // They must never be replaced by Contrast or ignored in a multi-FX stack.
  if (['brightness','contrast','saturate','hue','grayscale','sepia','invert'].includes(e.kind)) {
    const filter = e.kind === 'hue' ? `hue-rotate(${a}deg)`
      : e.kind === 'brightness' ? `brightness(${a}%)`
      : e.kind === 'contrast' ? `contrast(${a}%)`
      : e.kind === 'saturate' ? `saturate(${a}%)`
      : `${e.kind}(${Math.max(0,Math.min(100,a))}%)`;
    target.filter=filter;
    draw();
  } else if (mode===1) {
    target.filter=`blur(${Math.min(48,amount*.55)}px)`;draw();
  } else if (mode===2 || mode===3) {
    // A real, parameter-dependent luminous silhouette, never a shifted or
    // upscaled copy. Keep source pixels in their original coordinates.
    const softness=numeric('softness',24);
    const radius=Math.max(0,amount*.42+softness*.28);
    const opacity=Math.max(0,Math.min(1,numeric('opacity',75)/100*amount/100));
    const alpha=Math.round(opacity*255).toString(16).padStart(2,'0');
    if (mode===3 && p?.glowMode==='bloom') {
      draw();
      target.globalCompositeOperation='screen';
      target.globalAlpha=opacity;
      target.filter=`blur(${Math.min(70,radius)}px)`;
      draw();
    } else {
      // Canvas2D drop-shadow is alpha-based: its outer halo remains outside
      // the silhouette without changing the image's scale, color or position.
      target.filter=`drop-shadow(0px 0px ${Math.min(70,radius)}px ${glowColor}${alpha})`;
      draw();
    }
  } else if (mode===4) {
    draw();target.globalAlpha=.35;
    target.globalCompositeOperation='screen';
    target.filter='hue-rotate(130deg)';target.drawImage(source,0,0,width,height);
    target.filter='hue-rotate(-130deg)';target.drawImage(source,0,0,width,height);
  } else if (mode===5) {
    draw();
    const slices= Math.min(22,Math.max(4,Math.round(a*.16)));
    for(let i=0;i<slices;i++) {
      const top=Math.floor((i+.3)/slices*height);
      const h=Math.max(2,Math.floor(height/slices*.1));
      const shift=Math.sin(i*79.1+numeric('seed',0))*amount*.3;
      target.drawImage(source,0,top,width,h,shift,top,width,h);
    }
    target.globalAlpha=Math.max(0,Math.min(.45,a/180));
    target.fillStyle='rgba(18,0,45,.7)';
    for(let i=0;i<Math.min(40,Math.ceil(height/15));i++) target.fillRect(0,i*15,width,1);
  } else if (mode===6) {
    draw();
    const slices=18;
    for(let i=0;i<slices;i++) {
      const top=Math.floor(i/slices*height);
      const h=Math.max(1,Math.ceil(height/slices));
      const shift=Math.sin(i*.7+numeric('frequency',0))*a*.33;
      target.drawImage(source,0,top,width,h,shift,top,width,h);
    }
  } else if (mode===7) {
    const pixelSize=Math.min(90,Math.max(1,Math.round(amount)));
    if(e.kind==='posterize'||e.kind==='dither') {
      target.filter=`contrast(${Math.min(300,100+a*2)}%) saturate(${Math.min(300,100+a)}%)`;
      draw();
    } else {
      const tiny=fallbackTile.canvas??=document.createElement('canvas');
      tiny.width=Math.max(1,Math.ceil(width/pixelSize));
      tiny.height=Math.max(1,Math.ceil(height/pixelSize));
      const ct=tiny.getContext('2d');
      if (ct) {
        ct.clearRect(0,0,tiny.width,tiny.height);
        ct.drawImage(source,0,0,tiny.width,tiny.height);
        target.imageSmoothingEnabled=false;
        target.drawImage(tiny,0,0,width,height);
        target.imageSmoothingEnabled=true;
      } else draw();
    }
  } else if (mode===16 || mode===17) {
    // Never shift painting previews. Preserve source geometry, make a bounded
    // soft or color-local preview while the exact painter runs after release.
    draw();
    const brush = Math.max(2, mode===16 ? numeric('brushSize',4) : numeric('diffusion',7));
    target.globalAlpha = Math.max(0, Math.min(.65,a / 160));
    target.filter = mode===16 ? `contrast(${Math.min(150,100+a*.35)}%)` : `blur(${Math.min(5,brush*.35)}px)`;
    draw();
  } else if (mode===8) {
    target.filter=`contrast(${100+Math.max(0,a)*2}%) saturate(${Math.max(0,120-a)}%)`;
    draw();
  } else if (mode===9) {
    draw();
    const gradient=target.createRadialGradient(width/2,height/2,0,width/2,height/2,Math.hypot(width,height)*.65);
    gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,`rgba(0,0,0,${Math.min(.9,a/110)})`);
    target.fillStyle=gradient;target.fillRect(0,0,width,height);
  } else if(mode===10) {
    draw();
    // Bounded deterministic grain on coarse cells, not a full-document getImageData.
    const n=Math.min(90,Math.max(15,Math.round(a*1.2)));
    for(let i=0;i<n;i++) {
      const x=(Math.sin(i*17.13)*43758.5%1+1)%1*width;
      const y=(Math.sin(i*43.98)*26934.5%1+1)%1*height;
      target.fillStyle=i%2?'rgba(255,255,255,.19)':'rgba(0,0,0,.21)';
      target.fillRect(x,y,Math.max(1,width/900),Math.max(1,height/900));
    }
  } else if(mode===11) {
    target.shadowColor=glowColor;
    target.shadowBlur=width*height<=400_000 ? Math.min(14,amount*.24) : 0;
    target.shadowOffsetX=numeric('offsetX',8);target.shadowOffsetY=numeric('offsetY',12);
    // One draw keeps the visible artwork anchored; no second brightness-
    // modified image is composited above it during a drag.
    draw();
  } else if(mode===12) {
    target.filter=`contrast(${Math.min(180,100+amount*.4)}%)`;draw();
  } else if(mode===13) {
    draw();
    const gradient=target.createRadialGradient(width*.5,height*.45,0,width*.5,height*.45,Math.max(width,height)*.75);
    gradient.addColorStop(0,glowColor);gradient.addColorStop(1,'transparent');
    target.globalAlpha=Math.min(.65,Math.max(0,a)/180);
    target.globalCompositeOperation='screen';
    target.fillStyle=gradient;target.fillRect(0,0,width,height);
  } else if(mode===15) {
    target.filter=`contrast(${Math.min(300,100+Math.max(0,a)*1.4)}%)`; draw();
  } else if(mode===14) {
    const neutral=e.kind==='gamma'?100:0;
    const v=a-neutral;
    target.filter=e.kind==='exposure'?`brightness(${Math.max(0,100+v)}%)`
      :e.kind==='gamma'?`brightness(${Math.max(20,100+v*.5)}%)`
        :e.kind==='temperature'?`sepia(${Math.min(100,Math.abs(a))}%)`
          :`contrast(${Math.max(10,100+v*.5)}%)`;
    draw();
  } else draw();
  target.restore();
  return true;
}

interface CanvasPrefix {
  source: HTMLCanvasElement;
  signatures: string[];
  index: number;
  pixels: HTMLCanvasElement;
}
// Only one retained prefix is required for smooth drags, even with dozens of
// previously applied FX. Input artwork and the original document are untouched.
let canvasPrefix: CanvasPrefix | null = null;
const canvasScratch: HTMLCanvasElement[] = [];
function scratch(index:number,width:number,height:number):HTMLCanvasElement {
  const result=canvasScratch[index] ??= document.createElement('canvas');
  if(result.width!==width||result.height!==height){result.width=width;result.height=height;}
  return result;
}

/** Process *every* enabled effect in document order, with no arbitrary stack
 * size cutoff. A GPU-less WebView cannot maintain 60 FPS for very expensive
 * effects, but it must never replace five applied FX with one unrelated draft.
 */
export function paintCanvasEffectDraft(target:CanvasRenderingContext2D,source:HTMLCanvasElement,effects:readonly Effect[],width:number,height:number):boolean {
  const enabled=effects.filter(effect=>effect.enabled);
  if(!enabled.length || typeof document==='undefined' || !gpuPreviewSupport(enabled)) return false;
  const signatures=enabled.map(effect=>JSON.stringify(effect));
  const change=canvasPrefix?.source===source &&
    canvasPrefix.pixels.width===width && canvasPrefix.pixels.height===height
    ? signatures.findIndex((value,index)=>canvasPrefix?.signatures[index]!==value) : 0;
  const firstChanged=change<0?signatures.length:change;
  const validPrefix=canvasPrefix?.source===source &&
    canvasPrefix.pixels.width===width && canvasPrefix.pixels.height===height &&
    canvasPrefix.index<firstChanged &&
    canvasPrefix.signatures.every((value,index)=>value===signatures[index]);
  const begin=validPrefix?canvasPrefix!.index+1:0;
  if (begin >= enabled.length) {
    target.drawImage(canvasPrefix!.pixels, 0, 0, width, height);
    return true;
  }
  const saveIndex=firstChanged>0?firstChanged-1:enabled.length-2;
  let input=begin>0?canvasPrefix!.pixels:source;
  for(let i=begin;i<enabled.length;i++){
    const last=i===enabled.length-1;
    const output=last?target:scratch(i%2,width,height).getContext('2d');
    if(!output)return false;
    if(!last)output.clearRect(0,0,width,height);
    if(!paintSingleCanvasEffect(output,input,enabled[i],width,height))return false;
    if(i===saveIndex&&!last){
      // Save one complete, unchanged prefix for subsequent slider moves.
      const cached=document.createElement('canvas');cached.width=width;cached.height=height;
      cached.getContext('2d')?.drawImage(output.canvas,0,0);
      canvasPrefix={source,signatures:signatures.slice(0,i+1),index:i,pixels:cached};
    }
    if(!last)input=output.canvas;
  }
  return true;
}

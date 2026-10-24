/**
 * Spectrum's interactive-only GPU crossfade/extrapolation path.
 *
 * A full-resolution, CPU-only creative effect cannot be recomputed 60 times a
 * second when one evaluation takes longer than a frame. While a worker runs,
 * this compositor gives *immediate* visual feedback by varying its last exact
 * result against the unchanged native-resolution input. An accurate worker
 * bitmap always replaces the temporary interpolation when ready. It never
 * changes the document or the export path.
 */
import type { Effect } from './types';

export interface MixPlan { factor: number; kind: string }

const nonStrengthAmounts = new Set(['posterize', 'pixelate', 'mosaic', 'halftone', 'hue']);
const neutralAt100 = new Set(['gamma', 'brightness', 'contrast', 'saturate']);

/** Only extrapolate when precisely one independent strength control changed.
 * A color stop, position, or geometry control cannot safely be represented as
 * an opacity interpolation. Those controls await their exact worker result.
 */
export function mixPlan(previous: readonly Effect[], incoming: readonly Effect[]): MixPlan | null {
  if (previous.length !== 1 || incoming.length !== 1) return null;
  const old = previous[0];
  const next = incoming[0];
  if (old.id !== next.id || old.kind !== next.kind || old.enabled !== next.enabled || !next.enabled ||
      old.color !== next.color || JSON.stringify(old.parameters ?? {}) !== JSON.stringify(next.parameters ?? {}) ||
      old.amount === next.amount || nonStrengthAmounts.has(next.kind)) return null;
  const neutral = neutralAt100.has(next.kind) ? 100 : 0;
  const denominator = old.amount - neutral;
  if (Math.abs(denominator) < 0.01) return null;
  const factor = (next.amount - neutral) / denominator;
  if (!Number.isFinite(factor) || factor < -0.3 || factor > 2.5) return null;
  return { factor, kind: next.kind };
}

class GpuMixer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private sourceTexture: WebGLTexture;
  private effectTexture: WebGLTexture;
  private sourceImage: TexImageSource | null = null;
  private effectImage: TexImageSource | null = null;
  private bitmapImage: ImageBitmap | null = null;
  private bitmapCanvas: HTMLCanvasElement | null = null;
  private unavailable = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true,
      antialias: false, depth: false, stencil: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    const shader = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Shader allocation failed');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
      return shader;
    };
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      precision highp float;
      out vec2 uv;
      void main() {
        vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0,
                      (gl_VertexID == 1) ? 3.0 : -1.0);
        uv = p * 0.5 + 0.5;
        gl_Position = vec4(p, 0.0, 1.0);
      }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec2 uv;
      uniform sampler2D original;
      uniform sampler2D processed;
      uniform float strength;
      out vec4 pixel;
      void main() {
        // Operate on premultiplied-alpha colors to avoid bright fringes around
        // text and transparent pasted subjects during the provisional preview.
        vec4 a = texture(original, uv);
        vec4 b = texture(processed, uv);
        vec3 premulA = a.rgb * a.a;
        vec3 premulB = b.rgb * b.a;
        float alpha = clamp(mix(a.a, b.a, strength), 0.0, 1.0);
        vec3 premul = clamp(mix(premulA, premulB, strength), 0.0, alpha);
        // premultipliedAlpha:true requests premultiplied drawing-buffer pixels.
        pixel = vec4(premul, alpha);
      }`);
    const program = gl.createProgram();
    if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Link failed');
    this.program = program;
    const src = gl.createTexture(), fx = gl.createTexture();
    if (!src || !fx) throw new Error('Texture allocation failed');
    this.sourceTexture = src;
    this.effectTexture = fx;
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'original'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'processed'), 1);
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.unavailable = true; });
  }

  render(source: HTMLCanvasElement, effect: ImageBitmap | HTMLCanvasElement, factor: number): HTMLCanvasElement | null {
    if (this.unavailable || source.width > 8192 || source.height > 8192 ||
        source.width < 1 || source.height < 1) return null;
    const gl = this.gl;
    // The WebGL UNPACK_FLIP_Y_WEBGL flag is ignored for ImageBitmap sources in
    // some browsers, but honored for HTMLCanvasElement. Normalize the exact
    // worker bitmap through a retained 2D canvas once per completed job so the
    // two GPU textures always share the same orientation and alpha convention.
    let exactSource: TexImageSource = effect;
    if (typeof ImageBitmap !== 'undefined' && effect instanceof ImageBitmap) {
      if (this.bitmapImage !== effect || !this.bitmapCanvas) {
        this.bitmapCanvas ??= document.createElement('canvas');
        this.bitmapCanvas.width = effect.width;
        this.bitmapCanvas.height = effect.height;
        const bitmapContext = this.bitmapCanvas.getContext('2d');
        if (!bitmapContext) return null;
        bitmapContext.drawImage(effect, 0, 0);
        this.bitmapImage = effect;
        this.effectImage = null;
      }
      exactSource = this.bitmapCanvas;
    }
    if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
      this.canvas.width = source.width;
      this.canvas.height = source.height;
      this.sourceImage = null; this.effectImage = null;
    }
    if (source === this.canvas || exactSource === this.canvas) return null;
    const bind = (unit: number, texture: WebGLTexture, image: TexImageSource, old: TexImageSource | null): void => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (image !== old) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      }
    };
    try {
      gl.useProgram(this.program);
      bind(0, this.sourceTexture, source, this.sourceImage);
      bind(1, this.effectTexture, exactSource, this.effectImage);
      this.sourceImage = source;
      this.effectImage = exactSource;
      gl.uniform1f(gl.getUniformLocation(this.program, 'strength'), factor);
      gl.viewport(0, 0, source.width, source.height);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return this.canvas;
    } catch {
      this.unavailable = true;
      return null;
    }
  }
}

let gpu: GpuMixer | null = null;
let failed = false;

/** Only called for Studio's temporary preview; no GPU code affects exports. */
export function drawLiveStrengthPreview(
  target: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  exact: HTMLCanvasElement | ImageBitmap,
  previousSettings: readonly Effect[],
  currentSettings: readonly Effect[],
  width: number,
  height: number,
): boolean {
  const plan = mixPlan(previousSettings, currentSettings);
  if (!plan) return false;
  if (!failed && typeof document !== 'undefined' && 'WebGL2RenderingContext' in globalThis) {
    try {
      gpu ??= new GpuMixer();
      const pixels = gpu.render(source, exact, plan.factor);
      if (pixels) {
        target.drawImage(pixels, 0, 0, width, height);
        return true;
      }
    } catch {
      failed = true;
    }
  }
  // Canvas2D fallback when Windows WebView or a Linux browser disables WebGL.
  // Only interpolation is possible without a shader; *never* pixel-loop the
  // entire document on the UI thread to extrapolate a slow worker result.
  if (plan.factor >= 0 && plan.factor <= 1 && !['cutout'].includes(plan.kind)) {
    target.save();
    target.drawImage(source, 0, 0, width, height);
    target.globalAlpha *= plan.factor;
    target.drawImage(exact, 0, 0, width, height);
    target.restore();
    return true;
  }
  return false;
}

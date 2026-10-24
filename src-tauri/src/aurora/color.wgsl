// Aurora D: real GPU compute for five initial migrated pointwise operations.
// The numeric behavior mirrors process_pixel in the Rust CPU backend; effect
// names not supported here are processed by the actual Rust CPU operation.
struct Parameters {
  count: u32,
  kind: u32,
  amount: f32,
  _padding: u32,
  width: u32,
  height: u32,
  _padding2: u32,
  _padding3: u32,
};
@group(0) @binding(0) var<storage, read> source: array<u32>;
@group(0) @binding(1) var<storage, read_write> destination: array<u32>;
@group(0) @binding(2) var<uniform> params: Parameters;

fn channel(value: u32, shift: u32) -> f32 { return f32((value >> shift) & 255u); }
fn output(value: f32) -> u32 { return u32(clamp(floor(value + .5), 0.0, 255.0)); }

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  if (i >= params.count) { return; }
  let pixel = source[i];
  let alpha = (pixel >> 24u) & 255u;
  let r = channel(pixel, 0u);
  let g = channel(pixel, 8u);
  let b = channel(pixel, 16u);
  var out_r = r;
  var out_g = g;
  var out_b = b;
  let factor = params.amount / 100.0;
  switch params.kind {
    case 0u: { // brightness
      out_r = r * factor; out_g = g * factor; out_b = b * factor;
    }
    case 1u: { // contrast
      out_r = (r - 127.5) * factor + 127.5;
      out_g = (g - 127.5) * factor + 127.5;
      out_b = (b - 127.5) * factor + 127.5;
    }
    case 2u: { // saturation (the exact matrix used by the CPU reference)
      out_r = (0.213 + 0.787 * factor) * r + (0.715 - 0.715 * factor) * g + (0.072 - 0.072 * factor) * b;
      out_g = (0.213 - 0.213 * factor) * r + (0.715 + 0.285 * factor) * g + (0.072 - 0.072 * factor) * b;
      out_b = (0.213 - 0.213 * factor) * r + (0.715 - 0.715 * factor) * g + (0.072 + 0.928 * factor) * b;
    }
    case 3u: { // grayscale
      let t = clamp(factor, 0.0, 1.0);
      out_r = r * (1.0 - t * 0.787) + g * (t * 0.715) + b * (t * 0.072);
      out_g = r * (t * 0.213) + g * (1.0 - t * 0.285) + b * (t * 0.072);
      out_b = r * (t * 0.213) + g * (t * 0.715) + b * (1.0 - t * 0.928);
    }
    case 4u: { // invert
      let t = clamp(factor, 0.0, 1.0);
      out_r = r * (1.0 - t) + (255.0 - r) * t;
      out_g = g * (1.0 - t) + (255.0 - g) * t;
      out_b = b * (1.0 - t) + (255.0 - b) * t;
    }
    default: {}
  }
  destination[i] = output(out_r) | (output(out_g) << 8u) | (output(out_b) << 16u) | (alpha << 24u);
}

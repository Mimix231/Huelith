// Huelith GPU scene graph v1. Shared verbatim between WebGPU and Rust wgpu.
// Input textures are straight-alpha RGBA; output is premultiplied for source-over.
// All geometry uses a centre-relative, resolution-independent canvas coordinate.
struct Layer {
    position_scale: vec4<f32>, // translation x/y, relative quad width/height
    rotation_opacity: vec4<f32>, // cosine, sine, opacity, reserved
    source_rect: vec4<f32>, // UV: x, y, width, height
    mask_rect: vec4<f32>, // project-local canvas: x, y, width, height
    mask_flags: vec4<f32>, // mask mode, invert, reserved, reserved
};
@group(0) @binding(0) var layer_texture: texture_2d<f32>;
@group(0) @binding(1) var layer_sampler: sampler;
@group(0) @binding(2) var<uniform> layer: Layer;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) local_uv: vec2<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOutput {
    // Triangle-strip ordering expressed as two independent triangles.
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
    let vertex = corners[index];
    let scaled = vertex * layer.position_scale.zw;
    let aspect = select(1.0,layer.rotation_opacity.w,layer.rotation_opacity.w > 0.0);
    let rotated = vec2<f32>(
        scaled.x * layer.rotation_opacity.x - scaled.y * layer.rotation_opacity.y / aspect,
        scaled.x * layer.rotation_opacity.y * aspect + scaled.y * layer.rotation_opacity.x);
    var out: VertexOutput;
    out.position = vec4<f32>(
        rotated.x + 2.0 * layer.position_scale.x,
        rotated.y - 2.0 * layer.position_scale.y, 0.0, 1.0);
    out.uv = vec2<f32>((vertex.x + 1.0) * 0.5, (1.0 - vertex.y) * 0.5);
    // These coordinates describe the intermediate project-sized canvas
    // BEFORE the clip transform. A crop or mask must not move with a flip.
    out.local_uv=vec2<f32>(
        0.5 + vertex.x * layer.mask_flags.z * 0.5,
        0.5 - vertex.y * layer.mask_flags.w * 0.5);
    return out;
}

// Signed distance to a rectangle in project-normalized coordinates.
fn rectangle_distance(p: vec2<f32>, rect: vec4<f32>) -> f32 {
    let center = rect.xy + rect.zw * 0.5;
    let d = abs(p - center) - rect.zw * 0.5;
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = layer.source_rect.xy + in.uv * layer.source_rect.zw;
    let color = textureSample(layer_texture, layer_sampler, uv);
    // Full-frame source clipping and hard masks have antialiased edges,
    // preserving the reference Canvas2D raster appearance during transforms.
    let clip_distance = rectangle_distance(in.local_uv, vec4<f32>(0.0, 0.0, 1.0, 1.0));
    let clip_softness = max(fwidth(clip_distance), 0.000001);
    let clip_coverage = clamp(0.5 - clip_distance / clip_softness, 0.0, 1.0);
    var mask_coverage = 1.0;
    if (layer.mask_flags.x > 0.5) {
        var mask_distance = rectangle_distance(in.local_uv, layer.mask_rect);
        if (layer.mask_flags.x > 1.5) {
            let local = (in.local_uv - layer.mask_rect.xy) /
                max(layer.mask_rect.zw, vec2<f32>(0.000001));
            mask_distance = length((local - vec2<f32>(0.5)) * 2.0) - 1.0;
        }
        mask_coverage = clamp(0.5 - mask_distance /
            max(fwidth(mask_distance), 0.000001), 0.0, 1.0);
        if (layer.mask_flags.y > 0.5) { mask_coverage = 1.0 - mask_coverage; }
    }
    let alpha = clamp(color.a * layer.rotation_opacity.z * clip_coverage * mask_coverage, 0.0, 1.0);
    return vec4<f32>(color.rgb * alpha, alpha);
}

//! Huelith Round 8 native scene compositor. Rust and WebGPU use the exact
//! same WGSL program, geometry uniforms, layer order, and premultiplied blend.
//! This path accepts source pixels supplied by native media code; Round 9
//! replaces CPU source uploads with shared hardware-decoded GPU resources.
use serde::Deserialize;
use std::sync::{Mutex, OnceLock};
use wgpu::util::DeviceExt;

const SHADER: &str = include_str!("../../../src/editor/video/gpu/composite.wgsl");
const MAX_SCENE_BYTES: usize = 256 * 1024 * 1024;

fn default_full_rect() -> [f32; 4] { [0.0, 0.0, 1.0, 1.0] }
fn default_mask_flags() -> [f32; 4] { [0.0, 0.0, 1.0, 1.0] }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuLayerGeometry {
    pub position_scale: [f32; 4],
    pub rotation_opacity: [f32; 4],
    #[serde(default="default_full_rect")]
    pub source_rect: [f32; 4],
    #[serde(default="default_full_rect")]
    pub mask_rect: [f32; 4],
    #[serde(default="default_mask_flags")]
    pub mask_flags: [f32; 4],
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSceneLayer {
    pub id: String,
    pub source_width: u32,
    pub source_height: u32,
    pub rgba: Vec<u8>,
    pub geometry: GpuLayerGeometry,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSceneRequest {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub background: [f32; 4],
    pub layers: Vec<GpuSceneLayer>,
}

fn checked_frame_size(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 || width > 8192 || height > 8192 {
        return Err("Invalid GPU video frame dimensions".into());
    }
    (width as usize).checked_mul(height as usize).and_then(|n| n.checked_mul(4))
        .filter(|n| *n <= MAX_SCENE_BYTES)
        .ok_or_else(|| "GPU video frame exceeds the bounded memory limit".into())
}

fn validate_scene(scene: &GpuSceneRequest) -> Result<(), String> {
    if scene.version != 1 { return Err("Unsupported Huelith GPU graph version".into()); }
    checked_frame_size(scene.width, scene.height)?;
    if scene.layers.len() > 24 { return Err("GPU scene exceeds the maximum visual track budget".into()); }
    if !scene.background.iter().all(|n| n.is_finite() && (0.0..=1.0).contains(n)) {
        return Err("GPU background must contain normalized finite RGBA values".into());
    }
    let mut source_total = 0usize;
    for layer in &scene.layers {
        let size = checked_frame_size(layer.source_width, layer.source_height)?;
        if layer.rgba.len() != size { return Err(format!("GPU layer {} has an invalid RGBA byte count", layer.id)); }
        source_total = source_total.checked_add(size).ok_or("GPU source size overflow")?;
        if source_total > MAX_SCENE_BYTES { return Err("GPU scene exceeds its source-texture memory limit".into()); }
        if layer.id.len() > 200 || !layer.geometry.position_scale.iter().chain(layer.geometry.rotation_opacity.iter())
            .all(|n| n.is_finite()) { return Err("GPU layer has invalid transform parameters".into()); }
        if !layer.geometry.source_rect.iter().chain(layer.geometry.mask_rect.iter())
            .chain(layer.geometry.mask_flags.iter()).all(|n| n.is_finite()) {
            return Err("GPU layer has non-finite crop or mask parameters".into());
        }
        for rect in [layer.geometry.source_rect, layer.geometry.mask_rect] {
            if rect[0] < 0.0 || rect[1] < 0.0 || rect[2] <= 0.0 || rect[3] <= 0.0 ||
                rect[0] + rect[2] > 1.00001 || rect[1] + rect[3] > 1.00001 {
                return Err("GPU layer crop or mask is out of bounds".into());
            }
        }
        if ![0.0, 1.0, 2.0].contains(&layer.geometry.mask_flags[0]) ||
            ![0.0, 1.0].contains(&layer.geometry.mask_flags[1]) ||
            layer.geometry.mask_flags[2] <= 0.0 || layer.geometry.mask_flags[3] <= 0.0 {
            return Err("GPU layer has an unsupported mask mode or dimensions".into());
        }
        if !(0.0..=1.0).contains(&layer.geometry.rotation_opacity[2]) {
            return Err("GPU layer opacity must be between zero and one".into());
        }
    }
    Ok(())
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct LayerUniform {
    position_scale: [f32; 4],
    rotation_opacity: [f32; 4],
    source_rect: [f32; 4],
    mask_rect: [f32; 4],
    mask_flags: [f32; 4],
}

struct SceneRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    sampler: wgpu::Sampler,
}
impl SceneRenderer {
    fn new() -> Result<Self, String> {
        pollster::block_on(async {
            let instance = wgpu::Instance::default();
            let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            }).await.ok_or("A compatible video GPU adapter is unavailable")?;
            if adapter.get_info().device_type == wgpu::DeviceType::Cpu {
                return Err("Only a software video adapter is available; hardware GPU rendering is unavailable".into());
            }
            let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor {
                label: Some("Huelith Native Video Graph"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
            }, None).await.map_err(|e| format!("Failed to initialize Huelith video GPU: {e}"))?;
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("Huelith shared GPU video shader"),
                source: wgpu::ShaderSource::Wgsl(SHADER.into()),
            });
            let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("Huelith GPU video source-over graph"),
                layout: None,
                vertex: wgpu::VertexState { module: &module, entry_point: "vertex_main", buffers: &[] },
                fragment: Some(wgpu::FragmentState { module: &module, entry_point: "fragment_main",
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        blend: Some(wgpu::BlendState {
                            color: wgpu::BlendComponent {
                                src_factor: wgpu::BlendFactor::One,
                                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                                operation: wgpu::BlendOperation::Add,
                            },
                            alpha: wgpu::BlendComponent {
                                src_factor: wgpu::BlendFactor::One,
                                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                                operation: wgpu::BlendOperation::Add,
                            },
                        }),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
            });
            let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
                label: Some("Huelith video texture sampling"),
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                ..Default::default()
            });
            Ok(Self { device, queue, pipeline, sampler })
        })
    }

    fn render(&self, scene: GpuSceneRequest) -> Result<Vec<u8>, String> {
        validate_scene(&scene)?;
        let width = scene.width;
        let height = scene.height;
        if width > self.device.limits().max_texture_dimension_2d || height > self.device.limits().max_texture_dimension_2d {
            return Err("GPU scene exceeds the device texture dimension limit".into());
        }
        let output_size = checked_frame_size(width, height)?;
        let output = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Huelith GPU composited output"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let row_bytes = width.checked_mul(4).ok_or("GPU output row overflow")?;
        let row_stride = row_bytes.checked_add(255).ok_or("GPU row stride overflow")? & !255;
        let download_size = (row_stride as u64) * (height as u64);
        let download = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Huelith GPU output readback for native frame tests"),
            size: download_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Huelith native GPU frame graph"),
        });
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());
        // Each frame is one render pass irrespective of visual track count.
        // Avoid clearing/closing/reopening a render pass for every overlay.
        let mut draws = Vec::with_capacity(scene.layers.len());
        for layer in &scene.layers {
            if layer.source_width > self.device.limits().max_texture_dimension_2d ||
                layer.source_height > self.device.limits().max_texture_dimension_2d {
                return Err("GPU source texture exceeds device limits".into());
            }
            let source = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Huelith input video frame"),
                size: wgpu::Extent3d { width: layer.source_width, height: layer.source_height, depth_or_array_layers: 1 },
                mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            self.queue.write_texture(
                wgpu::ImageCopyTexture { texture: &source, mip_level: 0,
                    origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                &layer.rgba,
                wgpu::ImageDataLayout { offset: 0, bytes_per_row: Some(layer.source_width * 4),
                    rows_per_image: Some(layer.source_height) },
                wgpu::Extent3d { width: layer.source_width, height: layer.source_height, depth_or_array_layers: 1 },
            );
            let uniforms = LayerUniform {
                position_scale: layer.geometry.position_scale,
                rotation_opacity: layer.geometry.rotation_opacity,
                source_rect: layer.geometry.source_rect,
                mask_rect: layer.geometry.mask_rect,
                mask_flags: layer.geometry.mask_flags,
            };
            let buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Huelith video layer geometry"),
                contents: bytemuck::bytes_of(&uniforms),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let source_view = source.create_view(&wgpu::TextureViewDescriptor::default());
            let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Huelith video layer texture"),
                layout: &self.pipeline.get_bind_group_layout(0),
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&source_view) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                    wgpu::BindGroupEntry { binding: 2, resource: buffer.as_entire_binding() },
                ],
            });
            // Keep all source buffers, textures and groups alive while the
            // single batched GPU draw pass is submitted.
            draws.push((source, buffer, group));
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Huelith batched video composition"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view, resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: scene.background[0] as f64,
                            g: scene.background[1] as f64,
                            b: scene.background[2] as f64,
                            a: scene.background[3] as f64,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            for (_texture, _uniform, bind) in &draws {
                pass.set_bind_group(0, bind, &[]);
                pass.draw(0..6, 0..1);
            }
        }
        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture { texture: &output, mip_level: 0,
                origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            wgpu::ImageCopyBuffer { buffer: &download,
                layout: wgpu::ImageDataLayout { offset: 0, bytes_per_row: Some(row_stride), rows_per_image: Some(height) } },
            wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        );
        self.queue.submit(Some(encoder.finish()));
        let slice = download.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |status| { let _ = sender.send(status); });
        self.device.poll(wgpu::Maintain::Wait);
        receiver.recv().map_err(|_| "GPU video readback channel closed")?
            .map_err(|e| format!("GPU video readback failed: {e}"))?;
        let map = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity(output_size);
        for row in map.chunks_exact(row_stride as usize) {
            pixels.extend_from_slice(&row[..row_bytes as usize]);
        }
        drop(map);
        download.unmap();
        // GPU target uses premultiplied color. Native video encoders consume
        // straight-alpha RGBA (opaque export is unaffected).
        if scene.background[3] < 1.0 {
            for pixel in pixels.chunks_exact_mut(4) {
                let alpha = pixel[3] as u32;
                if alpha == 0 { pixel[0] = 0; pixel[1] = 0; pixel[2] = 0; }
                else if alpha < 255 { for c in &mut pixel[..3] { *c = ((*c as u32 * 255 + alpha/2) / alpha).min(255) as u8; } }
            }
        }
        Ok(pixels)
    }
}

static VIDEO_GPU: OnceLock<Result<Mutex<SceneRenderer>, String>> = OnceLock::new();

/// Development/CPU-decoder bridge for validating the native half of the same
/// GPU shader graph. Not used in the real-time 60fps path: Round 9 will supply
/// native GPU source textures directly without JSON RGBA transfers.
#[tauri::command]
pub async fn media_render_gpu_scene(scene: GpuSceneRequest) -> Result<Vec<u8>, String> {
    validate_scene(&scene)?;
    tauri::async_runtime::spawn_blocking(move || {
        let renderer = VIDEO_GPU.get_or_init(|| SceneRenderer::new().map(Mutex::new));
        let renderer = renderer.as_ref().map_err(Clone::clone)?;
        let guard = renderer.lock().map_err(|_| "Huelith video GPU worker is unavailable".to_owned())?;
        guard.render(scene)
    }).await.map_err(|e| format!("GPU scene task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn empty() -> GpuSceneRequest { GpuSceneRequest {
        version: 1, width: 64, height: 32, background: [0.0,0.0,0.0,1.0], layers: vec![],
    }}
    #[test] fn rejects_bad_versions_and_dimensions() {
        let mut scene = empty();
        assert!(validate_scene(&scene).is_ok());
        scene.version = 2; assert!(validate_scene(&scene).is_err());
        scene.version = 1; scene.width = 0; assert!(validate_scene(&scene).is_err());
    }
    #[test] fn rejects_mismatched_pixels_and_nan_transforms() {
        let mut scene = empty();
        scene.layers.push(GpuSceneLayer { id: "layer".into(), source_width: 2, source_height: 2,
            rgba: vec![0; 16], geometry: GpuLayerGeometry {
                position_scale: [0.,0.,1.,1.], rotation_opacity: [1.,0.,1.,0.],
                source_rect: default_full_rect(), mask_rect: default_full_rect(), mask_flags: default_mask_flags(),
            }});
        assert!(validate_scene(&scene).is_ok());
        scene.layers[0].rgba.pop(); assert!(validate_scene(&scene).is_err());
        scene.layers[0].rgba.push(0);
        scene.layers[0].geometry.rotation_opacity[2] = f32::NAN;
        assert!(validate_scene(&scene).is_err());
    }
    #[test] #[ignore = "Requires a real GPU adapter; run on the target Windows hardware"]
    fn gpu_test_pattern_renders_pixels() {
        let renderer = SceneRenderer::new().expect("GPU available");
        let mut scene = empty();
        scene.layers.push(GpuSceneLayer { id: "red".into(), source_width: 64, source_height: 32,
            rgba: [255,0,0,255].repeat(64*32), geometry: GpuLayerGeometry {
                position_scale: [0.,0.,1.,1.], rotation_opacity: [1.,0.,1.,0.],
                source_rect: default_full_rect(), mask_rect: default_full_rect(), mask_flags: default_mask_flags(),
            }});
        let pixels = renderer.render(scene).expect("GPU scene renders");
        let expected: &[u8] = &[255, 0, 0, 255];
        assert_eq!(&pixels[4 * 32..4 * 33], expected);
    }
}

//! Native wgpu compute backend. No software-lookalike effects and no silent
//! CPU emulation reported as "GPU". Blur is explicitly CPU until migrated.
use super::{CpuEffect, RgbaImage};
use wgpu::util::DeviceExt;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Zeroable, bytemuck::Pod)]
struct Params { count: u32, kind: u32, amount: f32, padding: u32, width: u32, height: u32, padding2: u32, padding3: u32 }

pub struct GpuEngine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    blur_pipeline: wgpu::ComputePipeline,
    layout: wgpu::BindGroupLayout,
    pub adapter_name: String,
}

pub fn gpu_kind(kind: &str) -> Option<u32> {
    match kind {
        "brightness" => Some(0), "contrast" => Some(1), "saturate" => Some(2),
        "grayscale" => Some(3), "invert" => Some(4), "blur" => Some(5), _ => None,
    }
}

impl GpuEngine {
    pub fn initialize() -> Result<Self, String> {
        pollster::block_on(async {
            let instance = wgpu::Instance::default();
            let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                // A software adapter should not be misrepresented as GPU acceleration.
                force_fallback_adapter: false,
            }).await.ok_or("No compatible wgpu compute adapter")?;
            let info = adapter.get_info();
            if info.device_type == wgpu::DeviceType::Cpu {
                return Err("Only a software GPU adapter is available; choose native CPU processing".into());
            }
            let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor {
                label: Some("Huelith Aurora GPU Compute"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
            }, None).await.map_err(|error| format!("GPU device initialization failed: {error}"))?;
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("Aurora reference color operations"),
                source: wgpu::ShaderSource::Wgsl(include_str!("color.wgsl").into()),
            });
            let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("Aurora RGBA buffers"),
                entries: &[
                    wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None,
                    }, count: None },
                    wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false }, has_dynamic_offset: false, min_binding_size: None,
                    }, count: None },
                    wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None,
                    }, count: None },
                ],
            });
            let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Aurora compute pipeline layout"), bind_group_layouts: &[&layout], push_constant_ranges: &[],
            });
            let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Aurora color compute"), layout: Some(&pipeline_layout), module: &module, entry_point: "main",
            });
            let blur_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("Aurora accurate premultiplied blur"),
                source: wgpu::ShaderSource::Wgsl(include_str!("blur.wgsl").into()),
            });
            let blur_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Aurora blur compute"), layout: Some(&pipeline_layout), module: &blur_module, entry_point: "main",
            });
            Ok(Self { device, queue, pipeline, blur_pipeline, layout, adapter_name: info.name })
        })
    }

    /// The reference CPU blur is a separable, premultiplied box kernel.
    /// Keep all intermediate passes device-resident; read back only the final image.
    /// The UI's legacy CSS Gaussian blur remains unchanged until proven equivalent.
    fn apply_blur(&self, image: &RgbaImage, effect: &CpuEffect) -> Result<RgbaImage, String> {
        let radius = effect.amount.max(0.0).round().min(80.0);
        if radius == 0.0 { return Ok(image.clone()); }
        let count = image.width.checked_mul(image.height).ok_or("GPU blur dimensions overflow")?;
        let bytes = image.pixels.len() as u64;
        if count > u32::MAX as usize || bytes > self.device.limits().max_storage_buffer_binding_size as u64 {
            return Err("GPU blur exceeds buffer limits; native CPU fallback required".into());
        }
        let source = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Aurora blur source"), contents: &image.pixels,
            usage: wgpu::BufferUsages::STORAGE,
        });
        let intermediate_a = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora horizontal RGBA"), size: bytes,
            usage: wgpu::BufferUsages::STORAGE, mapped_at_creation: false,
        });
        let intermediate_b = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora vertical RGBA"), size: bytes,
            usage: wgpu::BufferUsages::STORAGE, mapped_at_creation: false,
        });
        let output = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora blur final RGBA"), size: bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false,
        });
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora blur download"), size: bytes,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false,
        });
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Aurora blur 3 passes") });
        for (kind, input, dest) in [(5, &source, &intermediate_a),
                                    (6, &intermediate_a, &intermediate_b),
                                    (7, &intermediate_b, &output)] {
            let params = Params { count: count as u32, kind, amount: radius, padding: 0,
                width: image.width as u32, height: image.height as u32, padding2: 0, padding3: 0 };
            let uniform = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Aurora blur parameters"), contents: bytemuck::bytes_of(&params),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Aurora blur buffers"), layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: input.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: dest.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: uniform.as_entire_binding() },
                ],
            });
            {
                let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                    label: Some("Aurora separable blur"), timestamp_writes: None,
                });
                pass.set_pipeline(&self.blur_pipeline);
                pass.set_bind_group(0, &group, &[]);
                pass.dispatch_workgroups((count as u32).div_ceil(256), 1, 1);
            }
        }
        encoder.copy_buffer_to_buffer(&output, 0, &staging, 0, bytes);
        self.queue.submit(Some(encoder.finish()));
        let (sender, receiver) = std::sync::mpsc::channel();
        let slice = staging.slice(..);
        slice.map_async(wgpu::MapMode::Read, move |result| { let _ = sender.send(result); });
        self.device.poll(wgpu::Maintain::Wait);
        receiver.recv().map_err(|_| "GPU blur download channel closed")?
            .map_err(|error| format!("GPU blur download failed: {error}"))?;
        let pixels = slice.get_mapped_range().to_vec();
        let _ = slice;
        staging.unmap();
        Ok(RgbaImage { width: image.width, height: image.height, pixels })
    }

    pub fn apply(&self, image: &RgbaImage, effect: &CpuEffect) -> Result<RgbaImage, String> {
        let kind = gpu_kind(&effect.kind).ok_or("Operation is not migrated to the GPU")?;
        if kind == 5 { return self.apply_blur(image, effect); }
        let bytes = image.pixels.len() as u64;
        let count = image.width.checked_mul(image.height).ok_or("GPU dimensions overflow")?;
        if count > u32::MAX as usize || bytes > self.device.limits().max_storage_buffer_binding_size as u64 {
            return Err("Input exceeds this GPU's storage-buffer limit".into());
        }
        let input = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Aurora source"), contents: &image.pixels,
            usage: wgpu::BufferUsages::STORAGE,
        });
        let destination = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora result"), size: bytes,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false,
        });
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Aurora readback"), size: bytes,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false,
        });
        let parameters = Params { count: count as u32, kind, amount: effect.amount, padding: 0, width: image.width as u32, height: image.height as u32, padding2: 0, padding3: 0 };
        let uniforms = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Aurora parameters"), contents: bytemuck::bytes_of(&parameters), usage: wgpu::BufferUsages::UNIFORM,
        });
        let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Aurora compute bindings"), layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: input.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: destination.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: uniforms.as_entire_binding() },
            ],
        });
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Aurora compute pass") });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Aurora RGBA operation"), timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &group, &[]);
            pass.dispatch_workgroups((count as u32).div_ceil(256), 1, 1);
        }
        encoder.copy_buffer_to_buffer(&destination, 0, &staging, 0, bytes);
        self.queue.submit(Some(encoder.finish()));
        let (sender, receiver) = std::sync::mpsc::channel();
        let slice = staging.slice(..);
        slice.map_async(wgpu::MapMode::Read, move |result| { let _ = sender.send(result); });
        self.device.poll(wgpu::Maintain::Wait);
        receiver.recv().map_err(|_| "GPU readback channel closed")?
            .map_err(|error| format!("GPU readback failed: {error}"))?;
        let pixels = slice.get_mapped_range().to_vec();
        let _ = slice;
        staging.unmap();
        Ok(RgbaImage { width: image.width, height: image.height, pixels })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aurora::process;
    #[test]
    fn native_gpu_box_blur_preserves_cpu_reference_when_adapter_available() {
        let gpu = match GpuEngine::initialize() {
            Ok(engine) => engine,
            Err(reason) => { eprintln!("Skipping GPU blur parity test: {reason}"); return; }
        };
        let mut pixels = Vec::new();
        for y in 0..11u8 { for x in 0..19u8 {
            pixels.extend_from_slice(&[x*11, y*19, x*8+y*5, ((x as u16 * 13+y as u16 * 21)%256) as u8]);
        }}
        let image = RgbaImage { width: 19, height: 11, pixels };
        for radius in [0., 1., 2., 4., 11., 80.] {
            let effect = CpuEffect { kind: "blur".into(), amount: radius, parameters: None };
            let cpu = process(&image, std::slice::from_ref(&effect), 2).unwrap();
            let gpu_result = gpu.apply(&image, &effect).unwrap();
            for (index,(a,b)) in cpu.pixels.iter().zip(gpu_result.pixels.iter()).enumerate() {
                assert!((i16::from(*a)-i16::from(*b)).abs() <= 2,
                    "CPU/GPU blur differs at byte {index}, radius {radius}: CPU {a}, GPU {b}");
            }
        }
    }

    #[test]
    fn gpu_and_cpu_agree_on_migrated_pointwise_operations_when_adapter_available() {
        let gpu = match GpuEngine::initialize() {
            Ok(engine) => engine,
            Err(reason) => { eprintln!("Skipping GPU parity test: {reason}"); return; }
        };
        let image = RgbaImage { width: 4, height: 2, pixels: vec![
            31, 72, 151, 255, 221, 14, 56, 128, 45, 63, 87, 0, 12, 150, 211, 255,
            255, 255, 255, 255, 0, 0, 0, 255, 137, 49, 10, 64, 80, 90, 112, 255,
        ] };
        for kind in ["brightness", "contrast", "saturate", "grayscale", "invert"] {
            for amount in [0., 35., 100., 175., 200.] {
                let effect = CpuEffect { kind: kind.to_owned(), amount, parameters: None };
                let expected = process(&image, std::slice::from_ref(&effect), 1).unwrap();
                let actual = gpu.apply(&image, &effect).unwrap();
                for (gpu_byte, cpu_byte) in actual.pixels.iter().zip(expected.pixels.iter()) {
                    assert!((i16::from(*gpu_byte) - i16::from(*cpu_byte)).abs() <= 2,
                        "Mismatch for {kind} at {amount}: GPU {gpu_byte}, CPU {cpu_byte}");
                }
            }
        }
    }
}

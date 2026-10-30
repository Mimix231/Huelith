//! Aurora CPU foundation (Phases B and C).
//! Retained RGBA buffers, bounded inputs and deterministic ordered processors.
//! GPU and replacement of the legacy FX graph are later Aurora phases.
mod gpu;
mod graph;
mod native_effects;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use tauri::State;

const MAX_BYTES: usize = 160 * 1024 * 1024;
const MAX_IMAGES: usize = 6;

#[derive(Clone, Debug)]
pub(super) struct RgbaImage {
    pub(super) width: usize,
    pub(super) height: usize,
    pub(super) pixels: Vec<u8>,
}

#[derive(Default)]
pub struct CpuImageRegistry(Mutex<HashMap<String, Arc<RgbaImage>>>);

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CpuEffect {
    pub kind: String,
    pub amount: f32,
    #[serde(default)]
    pub parameters: Option<NativeParameters>,
}

#[derive(serde::Deserialize,serde::Serialize,Clone,Debug,Default)]
#[serde(rename_all = "camelCase")]
pub struct NativeParameters {
    pub threshold: Option<f32>,
    pub radius: Option<f32>,
    pub frequency: Option<f32>,
    pub angle: Option<f32>,
    pub seed: Option<f32>,
    pub color_mix: Option<f32>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    backend: &'static str,
    available_threads: usize,
    max_threads: usize,
    supported_operations: Vec<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuRenderResult {
    width: usize,
    height: usize,
    pixels: Vec<u8>,
    elapsed_ms: f64,
}

#[derive(serde::Serialize)]
pub struct CpuSelfTest { passed: bool, details: String }

fn logical_cores() -> usize {
    std::thread::available_parallelism().map(|cores| cores.get()).unwrap_or(1)
}
fn worker_count(preferred: usize, rows: usize) -> usize {
    let selected = if preferred == 0 { logical_cores() } else { preferred };
    selected.clamp(1, 32).min(rows.max(1))
}
fn validate_dimensions(width: usize, height: usize, len: usize) -> Result<(), String> {
    let required = width.checked_mul(height).and_then(|pixels| pixels.checked_mul(4))
        .ok_or("Image dimensions overflow")?;
    if width == 0 || height == 0 || required > MAX_BYTES || required != len {
        return Err("Invalid or oversized RGBA image; expected width × height × 4 bytes".into());
    }
    Ok(())
}
fn byte(value: f32) -> u8 {
    if value.is_finite() { value.round().clamp(0.0, 255.0) as u8 } else { 0 }
}
fn process_pixel(source: &[u8], output: &mut [u8], effect: &CpuEffect) {
    let alpha = source[3];
    let (r, g, b) = (source[0] as f32, source[1] as f32, source[2] as f32);
    let (mut red, mut green, mut blue) = (r, g, b);
    match effect.kind.as_str() {
        "brightness" => {
            let scale = effect.amount / 100.0;
            red *= scale; green *= scale; blue *= scale;
        }
        "contrast" => {
            let contrast = effect.amount / 100.0;
            red = (red - 127.5) * contrast + 127.5;
            green = (green - 127.5) * contrast + 127.5;
            blue = (blue - 127.5) * contrast + 127.5;
        }
        "saturate" => {
            let amount = effect.amount / 100.0;
            // CSS filter-style saturation matrix in sRGB channels.
            red = (0.213 + 0.787 * amount) * r + (0.715 - 0.715 * amount) * g + (0.072 - 0.072 * amount) * b;
            green = (0.213 - 0.213 * amount) * r + (0.715 + 0.285 * amount) * g + (0.072 - 0.072 * amount) * b;
            blue = (0.213 - 0.213 * amount) * r + (0.715 - 0.715 * amount) * g + (0.072 + 0.928 * amount) * b;
        }
        "grayscale" => {
            let t = (effect.amount / 100.0).clamp(0.0, 1.0);
            red = r * (1.0 - t * 0.787) + g * (t * 0.715) + b * (t * 0.072);
            green = r * (t * 0.213) + g * (1.0 - t * 0.285) + b * (t * 0.072);
            blue = r * (t * 0.213) + g * (t * 0.715) + b * (1.0 - t * 0.928);
        }
        "invert" => {
            let t = (effect.amount / 100.0).clamp(0.0, 1.0);
            red = r * (1.0 - t) + (255.0 - r) * t;
            green = g * (1.0 - t) + (255.0 - g) * t;
            blue = b * (1.0 - t) + (255.0 - b) * t;
        }
        _ => { /* validated before processing */ }
    }
    output[0] = byte(red);
    output[1] = byte(green);
    output[2] = byte(blue);
    output[3] = alpha;
}

/// Chunks split exclusively at row boundaries: no races, no cross-thread mutable
/// aliases. Blur must sample neighboring rows from the immutable full input.
fn map_rows(image: &RgbaImage, threads: usize, transform: &(impl Fn(usize, &[u8], &mut [u8]) + Sync)) -> Vec<u8> {
    let stride = image.width * 4;
    let workers = worker_count(threads, image.height);
    let rows_per_worker = image.height.div_ceil(workers);
    let mut output = vec![0u8; image.pixels.len()];
    std::thread::scope(|scope| {
        for (index, chunk) in output.chunks_mut(rows_per_worker * stride).enumerate() {
            let start = index * rows_per_worker;
            scope.spawn(move || {
                for (local, output_row) in chunk.chunks_mut(stride).enumerate() {
                    let y = start + local;
                    transform(y, &image.pixels[y * stride..(y + 1) * stride], output_row);
                }
            });
        }
    });
    output
}

fn cpu_blur(image: &RgbaImage, radius: usize, threads: usize) -> Vec<u8> {
    if radius == 0 { return image.pixels.clone(); }
    // Separable box blur; correct RGBA premultiplication protects transparent
    // subjects from dark fringes. This reference kernel must pass parity tests
    // before replacing the existing Gaussian CSS blur in user-facing FX.
    let radius = radius.min(80);
    let mut premultiplied = image.pixels.clone();
    for pixel in premultiplied.chunks_exact_mut(4) {
        let a = pixel[3] as f32 / 255.0;
        for channel in pixel.iter_mut().take(3) { *channel = byte(*channel as f32 * a); }
    }
    let width = image.width;
    let height = image.height;
    let first = RgbaImage { width, height, pixels: premultiplied };
    // Phase K: preserve the reference box-kernel mathematics while replacing
    // O(width × height × radius) neighborhood rescans with exact integer
    // sliding sums. Averaging/edge normalization still happen at each pass.
    let horizontal = map_rows(&first, threads, &|_y, source, row| {
        let mut sums = [0u32; 4];
        for x in 0..=radius.min(width - 1) {
            for c in 0..4 { sums[c] += source[x * 4 + c] as u32; }
        }
        for x in 0..width {
            let left = x.saturating_sub(radius);
            let right = (x + radius).min(width - 1);
            let n = (right - left + 1) as u32;
            for c in 0..4 { row[x * 4 + c] = ((sums[c] + n / 2) / n) as u8; }
            if x >= radius {
                let remove = x - radius;
                for c in 0..4 { sums[c] -= source[remove * 4 + c] as u32; }
            }
            if x + radius + 1 < width {
                let add = x + radius + 1;
                for c in 0..4 { sums[c] += source[add * 4 + c] as u32; }
            }
        }
    });
    let intermediate = RgbaImage { width, height, pixels: horizontal };
    let stride = width * 4;
    let workers = worker_count(threads, height);
    let rows_per_worker = height.div_ceil(workers);
    let mut output = vec![0u8; image.pixels.len()];
    std::thread::scope(|scope| {
        for (chunk_index, chunk) in output.chunks_mut(rows_per_worker * stride).enumerate() {
            let begin = chunk_index * rows_per_worker;
            let input = &intermediate.pixels;
            scope.spawn(move || {
                let mut sums = vec![0u32; stride];
                for y in begin.saturating_sub(radius)..=(begin + radius).min(height - 1) {
                    for (sum, byte) in sums.iter_mut().zip(&input[y * stride..(y + 1) * stride]) {
                        *sum += *byte as u32;
                    }
                }
                for (offset, row) in chunk.chunks_mut(stride).enumerate() {
                    let y = begin + offset;
                    let n = (y + radius).min(height - 1) - y.saturating_sub(radius) + 1;
                    for (out, sum) in row.iter_mut().zip(sums.iter()) {
                        *out = ((sum + (n as u32) / 2) / (n as u32)) as u8;
                    }
                    if y >= radius {
                        let removed = &input[(y - radius) * stride..(y - radius + 1) * stride];
                        for (sum, byte) in sums.iter_mut().zip(removed) { *sum -= *byte as u32; }
                    }
                    if y + radius + 1 < height {
                        let added = &input[(y + radius + 1) * stride..(y + radius + 2) * stride];
                        for (sum, byte) in sums.iter_mut().zip(added) { *sum += *byte as u32; }
                    }
                }
            });
        }
    });
    for pixel in output.chunks_exact_mut(4) {
        if pixel[3] == 0 { pixel[0] = 0; pixel[1] = 0; pixel[2] = 0; }
        else {
            let factor = 255.0 / pixel[3] as f32;
            for channel in pixel.iter_mut().take(3) { *channel = byte(*channel as f32 * factor); }
        }
    }
    output
}

pub(super) fn process(image: &RgbaImage, effects: &[CpuEffect], threads: usize) -> Result<RgbaImage, String> {
    if effects.len() > 1024 { return Err("CPU effect stack exceeds resource safety limit (1024)".into()); }
    let mut current = image.clone();
    for effect in effects {
        if !effect.amount.is_finite() || effect.amount.abs() > 1000.0 { return Err("Invalid CPU effect value".into()); }
        if native_effects::supported(&effect.kind) {
            native_effects::validate(effect)?;
            current = native_effects::apply(&current,effect,threads)?;
            continue;
        }
        if !["brightness", "contrast", "saturate", "grayscale", "invert", "blur"].contains(&effect.kind.as_str()) {
            return Err(format!("Native CPU operation '{}' is not migrated yet", effect.kind));
        }
        let result = if effect.kind == "blur" {
            cpu_blur(&current, effect.amount.max(0.0).round() as usize, threads)
        } else {
            map_rows(&current, threads, &|_y, source, target| {
                for (input, output) in source.chunks_exact(4).zip(target.chunks_exact_mut(4)) {
                    process_pixel(input, output, effect);
                }
            })
        };
        current.pixels = result;
    }
    Ok(current)
}

#[tauri::command]
pub fn aurora_cpu_info() -> CpuInfo {
    CpuInfo {
        backend: "rust-cpu", available_threads: logical_cores(), max_threads: 32,
        supported_operations: vec!["brightness", "contrast", "saturate", "grayscale", "invert", "blur", "atelier_3_12", "atelier_4_0", "atelier_7_0", "atelier_7_1"],
    }
}

#[tauri::command]
pub fn aurora_register_image(registry: State<'_, CpuImageRegistry>, controller: State<'_, AuroraController>, id: String, width: usize, height: usize, pixels: Vec<u8>) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 { return Err("Invalid image identifier".into()); }
    validate_dimensions(width, height, pixels.len())?;
    let image = Arc::new(RgbaImage { width, height, pixels });
    let mut entries = registry.0.lock().map_err(|_| "CPU image registry lock failed")?;
    if !entries.contains_key(&id) && entries.len() >= MAX_IMAGES { return Err("CPU image registry is full; release an inactive source first".into()); }
    entries.insert(id.clone(), image.clone());
    drop(entries);
    controller.0.graph.register_source(&id, image);
    Ok(())
}

/// Retain native source once as raw RGBA bytes, never 8 million JSON integers.
/// Body: magic HLRG, width u32 LE, height u32 LE, id length u16 LE,
/// UTF-8 identifier, then exactly width*height*4 bytes.
#[tauri::command]
pub fn aurora_register_image_raw(
    request: tauri::ipc::Request<'_>,
    registry: State<'_, CpuImageRegistry>,
    controller: State<'_, AuroraController>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Raw RGBA body required".into()); };
    if bytes.len() < 14 || &bytes[..4] != b"HLRG" { return Err("Invalid native image envelope".into()); }
    let width = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    let height = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    let length = u16::from_le_bytes(bytes[12..14].try_into().unwrap()) as usize;
    let body = 14usize.checked_add(length).ok_or("Identifier overflow")?;
    if bytes.len() < body {return Err("Truncated image identifier".into());}
    let id=std::str::from_utf8(&bytes[14..body]).map_err(|_|"Invalid UTF-8 image identifier")?.to_owned();
    if id.is_empty() || id.len()>128 {return Err("Invalid image identifier".into());}
    validate_dimensions(width,height,bytes.len()-body)?;
    let image=Arc::new(RgbaImage{width,height,pixels:bytes[body..].to_vec()});
    let mut entries=registry.0.lock().map_err(|_|"Native image registry lock failed")?;
    if !entries.contains_key(&id) && entries.len()>=MAX_IMAGES {return Err("Native image registry is full".into());}
    entries.insert(id.clone(),image.clone());
    drop(entries);
    controller.0.graph.register_source(&id,image);
    Ok(())
}

#[tauri::command]
pub fn aurora_release_image(registry: State<'_, CpuImageRegistry>, controller: State<'_, AuroraController>, id: String) -> Result<(), String> {
    registry.0.lock().map_err(|_| "CPU image registry lock failed")?.remove(&id);
    controller.0.graph.invalidate(&id);
    Ok(())
}

#[tauri::command]
pub async fn aurora_render_cpu(registry: State<'_, CpuImageRegistry>, id: String, effects: Vec<CpuEffect>, threads: usize) -> Result<CpuRenderResult, String> {
    let image = {
        registry.0.lock().map_err(|_| "CPU image registry lock failed")?
            .get(&id).cloned().ok_or("Source was not registered")?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let result = process(&image, &effects, threads)?;
        Ok(CpuRenderResult { width: result.width, height: result.height, pixels: result.pixels, elapsed_ms: start.elapsed().as_secs_f64() * 1000.0 })
    }).await.map_err(|err| format!("CPU operation failed: {err}"))?
}

#[tauri::command]
pub async fn aurora_cpu_self_test(threads: usize) -> Result<CpuSelfTest, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = RgbaImage { width: 2, height: 1, pixels: vec![100, 80, 40, 255, 60, 70, 80, 0] };
        let operations = [CpuEffect { kind: "brightness".into(), amount: 150.0, parameters: None }, CpuEffect { kind: "invert".into(), amount: 100.0, parameters: None }];
        let parallel = process(&source, &operations, threads)?;
        let serial = process(&source, &operations, 1)?;
        let passed = parallel.pixels == serial.pixels && parallel.pixels[0] == 105 && parallel.pixels[3] == 255;
        Ok(CpuSelfTest { passed, details: format!("2×1 RGBA, {} threads selected, chain brightness→invert, alpha preserved", worker_count(threads, 1)) })
    }).await.map_err(|err| format!("CPU self-test failed: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn image() -> RgbaImage {
        RgbaImage { width: 4, height: 2, pixels: vec![50, 100, 150, 255, 220, 100, 80, 255, 0, 0, 0, 0, 100, 90, 80, 128, 50, 100, 150, 255, 220, 100, 80, 255, 0, 0, 0, 0, 100, 90, 80, 128] }
    }
    // Phase K: compare the optimized sliding-window kernel to the original
    // direct-neighborhood reference, including transparent edges and radii
    // larger than either image dimension. Same RGBA bytes required, not just
    // an attractive-looking approximate blur.
    fn reference_blur(image: &RgbaImage, radius: usize) -> Vec<u8> {
        if radius == 0 { return image.pixels.clone(); }
        let radius = radius.min(80);
        let (width, height) = (image.width, image.height);
        let mut original = image.pixels.clone();
        for px in original.chunks_exact_mut(4) {
            let a = px[3] as f32 / 255.0;
            for c in 0..3 { px[c] = byte(px[c] as f32 * a); }
        }
        let mut horizontal = original.clone();
        for y in 0..height { for x in 0..width {
            let l = x.saturating_sub(radius);
            let r = (x + radius).min(width - 1);
            let n = (r-l+1) as u32;
            for c in 0..4 {
                let sum: u32 = (l..=r).map(|xx| original[(y*width+xx)*4+c] as u32).sum();
                horizontal[(y*width+x)*4+c] = ((sum+n/2)/n) as u8;
            }
        }}
        let mut out = horizontal.clone();
        for y in 0..height { for x in 0..width {
            let t = y.saturating_sub(radius);
            let b = (y + radius).min(height-1);
            let n = (b-t+1) as u32;
            for c in 0..4 {
                let sum: u32 = (t..=b).map(|yy| horizontal[(yy*width+x)*4+c] as u32).sum();
                out[(y*width+x)*4+c] = ((sum+n/2)/n) as u8;
            }
        }}
        for px in out.chunks_exact_mut(4) {
            if px[3] == 0 { px[0] = 0; px[1] = 0; px[2] = 0; }
            else {
                let f = 255.0 / px[3] as f32;
                for c in 0..3 { px[c] = byte(px[c] as f32 * f); }
            }
        }
        out
    }
    #[test]
    fn phase_k_fast_cpu_blur_is_bit_exact_to_reference() {
        for (w,h) in [(1,1),(1,13),(13,1),(19,11),(64,31)] {
            let mut pixels = Vec::new();
            for y in 0..h { for x in 0..w {
                pixels.extend_from_slice(&[(x*19%256) as u8,(y*37%256) as u8,
                    ((x*11+y*5)%256) as u8,((x*17+y*23)%256) as u8]);
            }}
            let source = RgbaImage { width:w, height:h, pixels };
            for radius in [0,1,2,5,40,80] {
                let expected = reference_blur(&source, radius);
                assert_eq!(cpu_blur(&source, radius, 1), expected);
                assert_eq!(cpu_blur(&source, radius, 4), expected);
            }
        }
    }

    #[test]
    fn dimension_guard() {
        assert!(validate_dimensions(4, 2, 32).is_ok());
        assert!(validate_dimensions(4, 2, 31).is_err());
        assert!(validate_dimensions(usize::MAX, 10, 0).is_err());
    }
    #[test]
    fn ordered_effects_preserve_alpha_and_do_not_mutate_source() {
        let base = image();
        let operations = [CpuEffect { kind: "brightness".into(), amount: 150.0, parameters: None }, CpuEffect { kind: "invert".into(), amount: 100.0, parameters: None }];
        let result = process(&base, &operations, 2).unwrap();
        assert_eq!(result.pixels[0..4], [180, 105, 30, 255]);
        assert_eq!(base.pixels[0..4], [50, 100, 150, 255]);
        assert_eq!(result.pixels[15], 128);
    }
    #[test]
    fn parallel_matches_single_thread() {
        let input = image();
        let stack = [CpuEffect { kind: "grayscale".into(), amount: 75.0, parameters: None }, CpuEffect { kind: "saturate".into(), amount: 115.0, parameters: None }, CpuEffect { kind: "blur".into(), amount: 2.0, parameters: None }];
        assert_eq!(process(&input, &stack, 1).unwrap().pixels, process(&input, &stack, 4).unwrap().pixels);
    }
    #[test]
    fn reject_unknown_operations_instead_of_faking_results() {
        let invalid = [CpuEffect { kind: "miasma".into(), amount: 90.0, parameters: None }];
        assert!(process(&image(), &invalid, 2).unwrap_err().contains("not migrated"));
    }
}

// ----------- Project Aurora Phase D / E / F retained backend manager ---------
#[derive(Clone, Default)]
pub struct AuroraController(std::sync::Arc<AuroraRuntime>);

#[derive(Default)]
struct AuroraRuntime {
    backend: RwLock<NativeBackend>,
    graph: graph::GraphRegistry,
}

#[derive(Default)]
struct NativeBackend {
    gpu: Option<Arc<gpu::GpuEngine>>,
    requested: bool,
    fallback: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuroraBackendStatus {
    requested: &'static str,
    active: &'static str,
    device: String,
    fallback_reason: Option<String>,
    gpu_supported_operations: Vec<&'static str>,
    cpu_supported_operations: Vec<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuroraGraphRender {
    width: usize,
    height: usize,
    pixels: Vec<u8>,
    elapsed_ms: f64,
    reused_stages: usize,
    cpu_stages: usize,
    gpu_stages: usize,
    active_backend: &'static str,
}

fn status(backend: &NativeBackend) -> AuroraBackendStatus {
    AuroraBackendStatus {
        requested: if backend.requested { "gpu" } else { "cpu" },
        active: if backend.gpu.is_some() && backend.requested { "gpu" } else { "cpu" },
        device: backend.gpu.as_ref().map(|gpu| gpu.adapter_name.clone()).unwrap_or_else(|| "System CPU".into()),
        fallback_reason: backend.fallback.clone(),
        gpu_supported_operations: vec!["brightness", "contrast", "saturate", "grayscale", "invert", "blur"],
        cpu_supported_operations: vec!["brightness", "contrast", "saturate", "grayscale", "invert", "blur", "atelier_3_12", "atelier_4_0", "atelier_7_0", "atelier_7_1"],
    }
}

#[tauri::command]
pub fn aurora_set_graph_budget(controller: State<'_, AuroraController>, mebibytes: usize) -> Result<(), String> {
    controller.0.graph.set_budget(mebibytes)
}

#[tauri::command]
pub fn aurora_backend_status(controller: State<'_, AuroraController>) -> Result<AuroraBackendStatus, String> {
    let backend = controller.0.backend.read().map_err(|_| "Aurora backend lock poisoned")?;
    Ok(status(&backend))
}

#[tauri::command]
pub async fn aurora_select_backend(controller: State<'_, AuroraController>, enabled: bool) -> Result<AuroraBackendStatus, String> {
    let manager = controller.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let attempt = if enabled {
            // Initializing a GPU may compile shaders and take considerable time.
            // This must never block React's main thread.
            match gpu::GpuEngine::initialize() {
                Ok(gpu) => Ok(Some(Arc::new(gpu))),
                Err(error) => Err(error),
            }
        } else { Ok(None) };
        let mut backend = manager.0.backend.write().map_err(|_| "Aurora backend lock poisoned")?;
        backend.requested = enabled;
        match attempt {
            Ok(gpu) => { backend.gpu = gpu; backend.fallback = None; },
            Err(error) => { backend.gpu = None; backend.fallback = Some(error); },
        }
        let value = status(&backend);
        drop(backend);
        // GPU and CPU arithmetic are close but not bit-identical; never reuse
        // intermediates calculated by the other backend.
        manager.0.graph.clear();
        Ok(value)
    }).await.map_err(|error| format!("Backend change failed: {error}"))?
}

async fn render_graph_internal(
    registry: State<'_, CpuImageRegistry>,
    controller: State<'_, AuroraController>,
    id: String,
    effects: Vec<CpuEffect>,
    threads: usize,
) -> Result<AuroraGraphRender, String> {
    let source = registry.0.lock().map_err(|_| "Native source registry unavailable")?
        .get(&id).cloned().ok_or("Retained source image not found")?;
    let manager = controller.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        // Hold an RwLock read guard through computation. Switching backend
        // acquires the write guard; it waits for in-flight native jobs before
        // invalidating GPU/CPU graph caches. No mixed-backend prefix reuse.
        let selected_backend = manager.0.backend.read().map_err(|_| "Aurora backend unavailable")?;
        let selected = selected_backend.gpu.clone();
        let mut gpu_error: Option<String> = None;
        let result = manager.0.graph.run(&id, source, &effects, |image, effect| {
            if gpu::gpu_kind(&effect.kind).is_some() {
                if gpu_error.is_none() {
                    if let Some(ref device) = selected {
                        match device.apply(image, effect) {
                            Ok(output) => {
                                return Ok((output, true));
                            }
                            Err(error) => {
                                // Never substitute fake FX after a device error.
                                eprintln!("Aurora GPU stage failed; using CPU: {error}");
                                gpu_error = Some(error);
                            }
                        }
                    }
                }
            }
            let cpu = process(image, std::slice::from_ref(effect), threads)?;
            Ok((cpu, false))
        })?;
        // Cached GPU prefixes require no new dispatch. Report which backend
        // serves this graph, rather than incorrectly labeling a cache hit CPU.
        // "gpuStages" still counts only newly computed GPU operations.
        let backend = if gpu_error.is_none() && selected.is_some() &&
            effects.iter().any(|effect| gpu::gpu_kind(&effect.kind).is_some()) {
            "gpu"
        } else { "cpu" };
        drop(selected_backend);
        if let Some(reason) = gpu_error {
            // A device failure is persistent until the user deliberately
            // retries GPU acceleration. Preserve the trustworthy CPU route.
            let mut backend = manager.0.backend.write().map_err(|_| "Aurora backend lock poisoned")?;
            let same_device = backend.gpu.as_ref().zip(selected.as_ref())
                .map(|(current, failed)| Arc::ptr_eq(current, failed)).unwrap_or(false);
            if same_device {
                backend.gpu = None;
                backend.fallback = Some(format!("GPU processing failed; CPU resumed: {reason}"));
                drop(backend);
                manager.0.graph.clear();
            }
        }
        Ok(AuroraGraphRender {
            width: result.image.width, height: result.image.height,
            pixels: result.image.pixels.clone(),
            elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
            reused_stages: result.reused_stages, cpu_stages: result.cpu_stages,
            gpu_stages: result.gpu_stages, active_backend: backend,
        })
    }).await.map_err(|error| format!("Native graph render failed: {error}"))?
}

/// Binary response: a single RGBA ArrayBuffer rather than JSON-encoded bytes.
/// Dimensions are the registered source dimensions; caller validates length.
#[tauri::command]
pub async fn aurora_render_graph_bytes(
    registry: State<'_, CpuImageRegistry>,
    controller: State<'_, AuroraController>,
    id: String,
    effects: Vec<CpuEffect>,
    threads: usize,
) -> Result<tauri::ipc::Response, String> {
    let result=render_graph_internal(registry,controller,id,effects,threads).await?;
    Ok(tauri::ipc::Response::new(result.pixels))
}

#[tauri::command]
pub async fn aurora_render_graph(
    registry: State<'_, CpuImageRegistry>,
    controller: State<'_, AuroraController>,
    id: String,
    effects: Vec<CpuEffect>,
    threads: usize,
) -> Result<AuroraGraphRender, String> {
    render_graph_internal(registry,controller,id,effects,threads).await
}

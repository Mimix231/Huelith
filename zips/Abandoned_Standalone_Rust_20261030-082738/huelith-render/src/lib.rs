//! Canonical native image graph, shared by desktop preview and export.
pub mod preview;
use anyhow::{bail, Result};
use huelith_core::{Document, Effect, Image, Layer};
use std::sync::Arc;

pub fn effect_stack(source: &Image, effects: &[Effect]) -> Result<Image> {
    let mut image = source.clone();
    for effect in effects.iter().filter(|e| e.enabled) {
        image = huelith_effects::apply(&image, effect)?;
    }
    Ok(image)
}
fn composite(destination: &mut Image, source: &Image, layer: &Layer) {
    let sx = layer
        .data
        .get("scaleX")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.) as f32;
    let sy = layer
        .data
        .get("scaleY")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.) as f32;
    let angle = -(layer
        .data
        .get("rotation")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.) as f32)
        .to_radians();
    let (sin, cos) = angle.sin_cos();
    let (cx, cy) = (source.width as f32 * 0.5, source.height as f32 * 0.5);
    for y in 0..destination.height {
        for x in 0..destination.width {
            let (dx, dy) = (
                x as f32 - layer.x as f32 - cx * sx,
                y as f32 - layer.y as f32 - cy * sy,
            );
            let p = source.sample(
                (dx * cos - dy * sin) / sx + cx,
                (dx * sin + dy * cos) / sy + cy,
            );
            let p = p.map(|v| v * layer.opacity as f32);
            let i = y * destination.width + x;
            let b = destination.pixels[i];
            if layer.blend == "source-over" {
                destination.pixels[i] = huelith_core::image::over(p, b);
                continue;
            }
            let mut out = [0.; 4];
            out[3] = p[3] + b[3] * (1. - p[3]);
            for c in 0..3 {
                let (a, v) = (p[c] / p[3].max(1e-8), b[c] / b[3].max(1e-8));
                let mixed = match layer.blend.as_str() {
                    "multiply" => a * v,
                    "screen" => a + v - a * v,
                    "overlay" => {
                        if v <= 0.5 {
                            2. * a * v
                        } else {
                            1. - 2. * (1. - a) * (1. - v)
                        }
                    }
                    "darken" => a.min(v),
                    "lighten" => a.max(v),
                    _ => a,
                };
                out[c] = p[c] * (1. - b[3]) + b[c] * (1. - p[3]) + mixed * p[3] * b[3];
            }
            destination.pixels[i] = out;
        }
    }
}
pub fn document(doc: &Document, resolve: &impl Fn(&str) -> Result<Arc<Image>>) -> Result<Image> {
    document_with_override(doc, resolve, None)
}
pub fn document_with_override(
    doc: &Document,
    resolve: &impl Fn(&str) -> Result<Arc<Image>>,
    processed_layer: Option<(&str, &Image)>,
) -> Result<Image> {
    doc.validate()?;
    let mut output = Image::new(doc.width, doc.height)?;
    if doc.background != "transparent" {
        if let Some(color) = hex_color(&doc.background) {
            output.pixels.fill(color);
        }
    }
    for layer in &doc.layers {
        if !layer.visible {
            continue;
        }
        if layer.kind != "raster" {
            bail!("The standalone renderer has not migrated {} layers yet. All saved layer data is retained.",layer.kind);
        }
        if layer.data.contains_key("cutoutMask")
            || layer.data.contains_key("mask")
            || layer.data.get("clipToBelow").and_then(|v| v.as_bool()) == Some(true)
            || layer.data.get("adjustment").and_then(|v| v.as_bool()) == Some(true)
        {
            bail!("Masked/adjustment layers are not migrated yet; use the existing editor for this project");
        }
        let image = layer
            .data
            .get("image")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if image.is_empty() {
            continue;
        }
        let source = resolve(image)?;
        let processed = if let Some((id, image)) = processed_layer.filter(|(id, _)| *id == layer.id)
        {
            let _ = id;
            image.clone()
        } else {
            effect_stack(&source, &layer.effects)?
        };
        composite(&mut output, &processed, layer);
    }
    if doc
        .data
        .get("creative")
        .and_then(|v| v.as_array())
        .is_some_and(|a| !a.is_empty())
    {
        bail!("Retained Originals are not migrated yet; their data is preserved");
    }
    Ok(output)
}
pub fn hex_color(value: &str) -> Option<[f32; 4]> {
    let s = value.strip_prefix('#')?;
    if s.len() != 6 || !s.is_ascii() {
        return None;
    }
    let mut out = [0.; 4];
    out[3] = 1.;
    for c in 0..3 {
        out[c] = huelith_core::image::linear(
            u8::from_str_radix(&s[c * 2..c * 2 + 2], 16).ok()? as f32 / 255.,
        );
    }
    Some(out)
}

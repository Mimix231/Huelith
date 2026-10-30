use anyhow::{bail, Context, Result};
use base64::Engine;
use huelith_core::{Document, Image, Layer};
use std::{io::Cursor, path::Path, sync::Arc};

pub fn read_project(path: &Path) -> Result<Document> {
    let bytes =
        std::fs::read(path).with_context(|| format!("Could not read {}", path.display()))?;
    let doc: Document = serde_json::from_slice(&bytes).context("Invalid project JSON")?;
    doc.validate()?;
    Ok(doc)
}
pub fn save_project(path: &Path, doc: &Document) -> Result<()> {
    doc.validate()?;
    let bytes = serde_json::to_vec_pretty(doc)?;
    let name = path
        .file_name()
        .context("Project filename is missing")?
        .to_string_lossy();
    let temp = path.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    let result = (|| -> Result<()> {
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}
pub fn decode(bytes: &[u8]) -> Result<Image> {
    let (width, height) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()?
        .into_dimensions()?;
    Image::validate_dimensions(width as usize, height as usize)?;
    let rgba = image::load_from_memory(bytes)?.to_rgba8();
    Image::from_rgba8(rgba.width() as usize, rgba.height() as usize, &rgba)
}
pub fn decode_url(url: &str) -> Result<Arc<Image>> {
    let (header, data) = url
        .split_once(',')
        .context("Expected an embedded data URL")?;
    if !header.starts_with("data:image/") || !header.ends_with(";base64") {
        bail!("Unsupported embedded image encoding");
    }
    Ok(Arc::new(decode(
        &base64::engine::general_purpose::STANDARD.decode(data)?,
    )?))
}
pub fn png_bytes(image: &Image) -> Result<Vec<u8>> {
    let rgba = image::RgbaImage::from_raw(image.width as u32, image.height as u32, image.rgba8())
        .context("Bad image dimensions")?;
    let mut bytes = Cursor::new(Vec::new());
    rgba.write_to(&mut bytes, image::ImageFormat::Png)?;
    Ok(bytes.into_inner())
}
pub fn image_url(image: &Image) -> Result<String> {
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png_bytes(image)?)
    ))
}
pub fn import_image(path: &Path) -> Result<Document> {
    let image = decode(&std::fs::read(path)?)?;
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported artwork");
    let mut doc = Document::new(name, image.width, image.height)?;
    doc.layers = vec![Layer::raster(name, image_url(&image)?)];
    doc.active_layer_id = Some(doc.layers[0].id.clone());
    Ok(doc)
}
pub fn render(doc: &Document) -> Result<Image> {
    use std::collections::HashMap;
    let mut assets = HashMap::new();
    for layer in &doc.layers {
        if let Some(url) = layer
            .data
            .get("image")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            assets.insert(url, decode_url(url)?);
        }
    }
    huelith_render::document(doc, &|url| {
        assets.get(url).cloned().context("Image asset missing")
    })
}
pub fn export(path: &Path, image: &Image) -> Result<()> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let format = match ext.as_str() {
        "png" => image::ImageFormat::Png,
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        "webp" => image::ImageFormat::WebP,
        _ => bail!("Choose PNG, JPEG or WebP"),
    };
    let mut rgba =
        image::RgbaImage::from_raw(image.width as u32, image.height as u32, image.rgba8())
            .context("Bad image dimensions")?;
    if format == image::ImageFormat::Jpeg {
        for p in rgba.pixels_mut() {
            let a = p[3] as f32 / 255.;
            for c in 0..3 {
                p[c] = (p[c] as f32 * a + 255. * (1. - a)).round() as u8;
            }
            p[3] = 255;
        }
    }
    let file = std::io::BufWriter::new(std::fs::File::create(path)?);
    if format == image::ImageFormat::Jpeg {
        image::codecs::jpeg::JpegEncoder::new_with_quality(file, 94)
            .encode_image(&image::DynamicImage::ImageRgba8(rgba).to_rgb8())?;
    } else {
        image::DynamicImage::ImageRgba8(rgba).write_to(&mut { file }, format)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn png_data_url_roundtrips_partial_transparency() {
        let image = Image::from_rgba8(2, 1, &[20, 30, 40, 255, 55, 90, 150, 128]).unwrap();
        assert_eq!(
            decode_url(&image_url(&image).unwrap()).unwrap().rgba8(),
            image.rgba8()
        );
    }
    #[test]
    fn project_save_reopen_keeps_the_authored_source() {
        let image = Image::from_rgba8(2, 1, &[20, 30, 40, 255, 55, 90, 150, 128]).unwrap();
        let mut doc = Document::new("Authored", 2, 1).unwrap();
        doc.layers[0]
            .data
            .insert("image".into(), image_url(&image).unwrap().into());
        let file = std::env::temp_dir().join(format!("huelith-rust-roundtrip-{}.huelith", doc.id));
        save_project(&file, &doc).unwrap();
        let reopened = read_project(&file).unwrap();
        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::to_value(&reopened).unwrap()
        );
        std::fs::remove_file(file).unwrap();
    }
}

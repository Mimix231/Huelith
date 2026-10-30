//! Separate native executable. The existing Tauri editor remains the default.
mod effect_controls;
use eframe::egui;
use huelith_core::{Document, Effect, Image};
use huelith_render::preview::{Composition, PreviewWorker, Request};
use std::{collections::HashMap, path::PathBuf, sync::Arc};

struct Editor {
    doc: Document,
    original_path: Option<PathBuf>,
    assets: HashMap<String, Arc<Image>>,
    source: Option<Arc<Image>>,
    composition: Option<Arc<Composition>>,
    worker: PreviewWorker,
    source_id: u64,
    revision: u64,
    published: u64,
    texture: Option<egui::TextureHandle>,
    exact: Option<Arc<Image>>,
    past: Vec<Document>,
    future: Vec<Document>,
    transaction: Option<Document>,
    dirty: bool,
    error: String,
    timing: f64,
    reused: usize,
    zoom: f32,
    search: String,
    close_dialog: bool,
}
impl Editor {
    fn new(cc: &eframe::CreationContext<'_>, input: Option<PathBuf>) -> Self {
        let context = cc.egui_ctx.clone();
        let mut style = (*context.style()).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.panel_fill = egui::Color32::from_rgb(23, 22, 39);
        style.visuals.window_fill = egui::Color32::from_rgb(29, 27, 46);
        style.visuals.selection.bg_fill = egui::Color32::from_rgb(117, 81, 184);
        style.spacing.item_spacing = egui::vec2(10., 10.);
        context.set_style(style);
        let wake = context.clone();
        let mut app = Self {
            doc: Document::new("Untitled", 1280, 800).unwrap(),
            original_path: None,
            assets: HashMap::new(),
            source: None,
            composition: None,
            worker: PreviewWorker::new(move || wake.request_repaint()),
            source_id: 0,
            revision: 0,
            published: 0,
            texture: None,
            exact: None,
            past: Vec::new(),
            future: Vec::new(),
            transaction: None,
            dirty: false,
            error: String::new(),
            timing: 0.,
            reused: 0,
            zoom: 1.,
            search: String::new(),
            close_dialog: false,
        };
        if let Some(input) = input {
            app.open(input);
        }
        app
    }
    fn active(&self) -> Option<usize> {
        self.doc
            .layers
            .iter()
            .position(|l| Some(&l.id) == self.doc.active_layer_id.as_ref())
    }
    fn open(&mut self, path: PathBuf) {
        let project = matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("huelith" | "spectrum")
        );
        match if project {
            huelith_io::read_project(&path)
        } else {
            huelith_io::import_image(&path)
        } {
            Ok(doc) => {
                self.doc = doc;
                self.original_path = Some(path);
                self.past.clear();
                self.future.clear();
                self.dirty = false;
                self.transaction = None;
                self.texture = None;
                self.exact = None;
                self.rebuild();
            }
            Err(e) => self.error = e.to_string(),
        }
    }
    fn rebuild(&mut self) {
        self.assets.clear();
        self.source = None;
        self.composition = None;
        self.source_id += 1;
        self.published = 0;
        for layer in &self.doc.layers {
            if let Some(url) = layer
                .data
                .get("image")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                match huelith_io::decode_url(url) {
                    Ok(image) => {
                        self.assets.insert(url.to_string(), image);
                    }
                    Err(e) => {
                        self.error = e.to_string();
                        return;
                    }
                }
            }
        }
        if let Some(index) = self.active() {
            let layer = &self.doc.layers[index];
            if let Some(url) = layer.data.get("image").and_then(|v| v.as_str()) {
                self.source = self.assets.get(url).cloned();
            }
            self.composition = Some(Arc::new(Composition {
                doc: Arc::new(self.doc.clone()),
                assets: self.assets.clone(),
                layer_id: layer.id.clone(),
            }));
        }
        self.queue();
    }
    fn queue(&mut self) {
        if let (Some(source), Some(index)) = (self.source.clone(), self.active()) {
            self.revision += 1;
            self.error.clear();
            self.worker.submit(Request {
                revision: self.revision,
                source_id: self.source_id,
                source,
                effects: self.doc.layers[index].effects.clone(),
                composition: self.composition.clone(),
            });
        } else {
            match huelith_io::render(&self.doc) {
                Ok(im) => self.exact = Some(Arc::new(im)),
                Err(e) => self.error = e.to_string(),
            }
        }
    }
    fn begin(&mut self) {
        if self.transaction.is_none() {
            self.transaction = Some(self.doc.clone());
        }
    }
    fn finish(&mut self) {
        if let Some(before) = self.transaction.take() {
            if serde_json::to_value(&before).ok() != serde_json::to_value(&self.doc).ok() {
                self.past.push(before);
                if self.past.len() > 100 {
                    self.past.remove(0);
                }
                self.future.clear();
                self.dirty = true;
            }
        }
    }
    fn undo(&mut self) {
        self.finish();
        if let Some(previous) = self.past.pop() {
            self.future.push(std::mem::replace(&mut self.doc, previous));
            self.dirty = true;
            self.rebuild();
        }
    }
    fn redo(&mut self) {
        if let Some(next) = self.future.pop() {
            self.past.push(std::mem::replace(&mut self.doc, next));
            self.dirty = true;
            self.rebuild();
        }
    }
    fn save_copy(&mut self) {
        self.finish();
        let Some(path) = rfd::FileDialog::new()
            .set_file_name(format!("{}-rust-copy.huelith", self.doc.name))
            .add_filter("Huelith project", &["huelith"])
            .save_file()
        else {
            return;
        };
        // Save As always asks for a distinct filename; the existing authored
        // project path is never an implicit write target during migration.
        if self.original_path.as_ref() == Some(&path) {
            self.error =
                "Choose a new filename so the authored project stays preserved during migration."
                    .into();
            return;
        }
        match huelith_io::save_project(&path, &self.doc) {
            Ok(()) => {
                self.dirty = false;
                self.error = format!("Saved {}", path.display());
            }
            Err(e) => self.error = e.to_string(),
        }
    }
    fn export(&mut self) {
        self.finish();
        let Some(path) = rfd::FileDialog::new()
            .set_file_name(format!("{}.png", self.doc.name))
            .add_filter("PNG", &["png"])
            .add_filter("JPEG", &["jpg"])
            .add_filter("WebP", &["webp"])
            .save_file()
        else {
            return;
        };
        match huelith_io::render(&self.doc).and_then(|image| huelith_io::export(&path, &image)) {
            Ok(()) => self.error = format!("Exported {}", path.display()),
            Err(e) => self.error = e.to_string(),
        }
    }
    fn show_frame(&mut self, ctx: &egui::Context) {
        let interacting = ctx.input(|i| i.pointer.any_down());
        for frame in self.worker.drain() {
            if frame.source_id != self.source_id
                || frame.revision < self.published
                || (!interacting && frame.revision != self.revision)
            {
                continue;
            }
            self.published = frame.revision;
            self.timing = frame.processing_ms;
            self.reused = frame.reused;
            match frame.image {
                Ok(image) => {
                    let pixels = image.rgba8();
                    let color = egui::ColorImage::from_rgba_unmultiplied(
                        [image.width, image.height],
                        &pixels,
                    );
                    if let Some(texture) = &mut self.texture {
                        texture.set(color, egui::TextureOptions::LINEAR);
                    } else {
                        self.texture =
                            Some(ctx.load_texture("document", color, egui::TextureOptions::LINEAR));
                    }
                    self.exact = Some(image);
                }
                Err(e) => self.error = e,
            }
        }
        if self.texture.is_none() {
            if let Some(image) = &self.exact {
                self.texture = Some(ctx.load_texture(
                    "document",
                    egui::ColorImage::from_rgba_unmultiplied(
                        [image.width, image.height],
                        &image.rgba8(),
                    ),
                    egui::TextureOptions::LINEAR,
                ));
            }
        }
    }
}
impl eframe::App for Editor {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.show_frame(ctx);
        if ctx.input(|i| i.viewport().close_requested()) && self.dirty {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            self.close_dialog = true;
        }
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::CTRL, egui::Key::Z)) {
            self.undo();
        }
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::CTRL, egui::Key::Y)) {
            self.redo();
        }
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::CTRL, egui::Key::S)) {
            self.save_copy();
        }
        egui::TopBottomPanel::top("header").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading(
                    egui::RichText::new("✧ Huelith").color(egui::Color32::from_rgb(198, 167, 255)),
                );
                ui.label("Native Rust · migration build");
                ui.separator();
                if ui.button("Open project / image").clicked() {
                    if self.dirty {
                        self.error =
                            "Save a copy of your current work before opening another project."
                                .into();
                    } else if let Some(path) = rfd::FileDialog::new()
                        .add_filter(
                            "Projects and images",
                            &[
                                "huelith", "spectrum", "png", "jpg", "jpeg", "webp", "bmp", "gif",
                            ],
                        )
                        .pick_file()
                    {
                        self.open(path);
                    }
                }
                if ui.button("Save copy").clicked() {
                    self.save_copy();
                }
                if ui.button("Export image").clicked() {
                    self.export();
                }
                if ui
                    .add_enabled(!self.past.is_empty(), egui::Button::new("Undo"))
                    .clicked()
                {
                    self.undo();
                }
                if ui
                    .add_enabled(!self.future.is_empty(), egui::Button::new("Redo"))
                    .clicked()
                {
                    self.redo();
                }
            });
        });
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(format!(
                    "{}{} · {} × {}",
                    self.doc.name,
                    if self.dirty { " *" } else { "" },
                    self.doc.width,
                    self.doc.height
                ));
                ui.separator();
                ui.label(format!(
                    "Exact CPU render {:.1} ms · {} cached stages",
                    self.timing, self.reused
                ));
            });
            if !self.error.is_empty() {
                ui.colored_label(egui::Color32::from_rgb(245, 192, 131), &self.error);
            }
        });
        egui::SidePanel::left("effects").resizable(true).default_width(235.).show(ctx,|ui|{
            ui.heading("Effects");ui.label("Implemented native kernels");ui.text_edit_singleline(&mut self.search);ui.separator();
            let query=self.search.to_lowercase();
            for descriptor in huelith_effects::CATALOG.iter().filter(|d|d.name.to_lowercase().contains(&query)){
                if ui.add_sized([ui.available_width(),34.],egui::Button::new(descriptor.name)).clicked(){if let Some(index)=self.active(){self.begin();self.doc.layers[index].effects.push(Effect::new(descriptor.id,descriptor.initial));self.finish();self.queue();}}
            }
            ui.separator();ui.heading("Layers");let mut selected=None;
            for (index,layer) in self.doc.layers.iter().enumerate().rev(){if ui.selectable_label(self.active()==Some(index),&layer.name).clicked(){selected=Some(layer.id.clone());}}
            if let Some(id)=selected{self.finish();self.doc.active_layer_id=Some(id);self.rebuild();}
            ui.separator();ui.small("Your existing Huelith editor remains available while the full native port is built.");
        });
        let mut changed = false;
        let mut finish = false;
        egui::SidePanel::right("inspector")
            .resizable(true)
            .default_width(285.)
            .show(ctx, |ui| {
                ui.heading("Effect stack");
                if let Some(layer) = self.active() {
                    let mut remove = None;
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        for index in 0..self.doc.layers[layer].effects.len() {
                            let effect = self.doc.layers[layer].effects[index].clone();
                            let descriptor = huelith_effects::CATALOG
                                .iter()
                                .find(|d| d.id == effect.kind);
                            ui.group(|ui| {
                                ui.horizontal(|ui| {
                                    ui.strong(descriptor.map(|d| d.name).unwrap_or(&effect.kind));
                                    if ui.small_button("×").clicked() {
                                        remove = Some(index);
                                    }
                                });
                                let mut enabled = effect.enabled;
                                if ui.checkbox(&mut enabled, "Enabled").changed() {
                                    self.begin();
                                    self.doc.layers[layer].effects[index].enabled = enabled;
                                    changed = true;
                                    finish = true;
                                }
                                let mut value = effect.amount;
                                let range = descriptor
                                    .map(|d| d.min as f64..=d.max as f64)
                                    .unwrap_or(0.0..=100.0);
                                let response =
                                    ui.add(egui::Slider::new(&mut value, range).text("Amount"));
                                if response.changed() {
                                    self.begin();
                                    self.doc.layers[layer].effects[index].amount = value;
                                    changed = true;
                                }
                                finish |= response.drag_stopped();
                                let controls: &[(&str, &str, f32, f32, f32)] =
                                    match effect.kind.as_str() {
                                        "atelier_3_12" => &[
                                            ("threshold", "Threshold", 0., 100., 45.),
                                            ("angle", "Direction", 0., 90., 0.),
                                            ("colorMix", "Color richness", 0., 100., 50.),
                                        ],
                                        "atelier_4_0" => &[
                                            ("frequency", "Frequency", 1., 100., 50.),
                                            ("angle", "Angle", -180., 180., 45.),
                                            ("colorMix", "Color richness", 0., 100., 50.),
                                        ],
                                        "atelier_7_0" => &[
                                            ("threshold", "Highlight threshold", 0., 100., 70.),
                                            ("radius", "Spread", 1., 80., 12.),
                                            ("frequency", "Diffusion scale", 1., 150., 50.),
                                            ("colorMix", "Warmth", 0., 100., 50.),
                                        ],
                                        "atelier_7_1" => &[
                                            ("threshold", "Highlight threshold", 0., 100., 70.),
                                            ("radius", "Streak width", 1., 512., 32.),
                                            ("frequency", "Scale", 1., 150., 50.),
                                            ("colorMix", "Cyan richness", 0., 100., 50.),
                                        ],
                                        _ => &[],
                                    };
                                for &(key, label, min, max, default) in controls {
                                    let mut value = effect
                                        .parameters
                                        .get(key)
                                        .and_then(|v| v.as_f64())
                                        .unwrap_or(default as f64)
                                        as f32;
                                    let response = ui
                                        .add(egui::Slider::new(&mut value, min..=max).text(label));
                                    if response.changed() {
                                        self.begin();
                                        self.doc.layers[layer].effects[index]
                                            .parameters
                                            .insert(key.into(), serde_json::json!(value));
                                        changed = true;
                                    }
                                    finish |= response.drag_stopped();
                                }
                                if let Some(patch) = effect_controls::edit(ui, &effect) {
                                    self.begin();
                                    self.doc.layers[layer].effects[index]
                                        .parameters
                                        .extend(patch);
                                    changed = true;
                                }
                            });
                        }
                    });
                    if let Some(index) = remove {
                        self.begin();
                        self.doc.layers[layer].effects.remove(index);
                        changed = true;
                        finish = true;
                    }
                }
                ui.separator();
                ui.label("Drag a slider to update continuously. One drag is one undo step.");
            });
        if changed {
            self.queue();
        }
        if finish || (!ctx.input(|i| i.pointer.any_down()) && self.transaction.is_some()) {
            self.finish();
        }
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(egui::Color32::from_rgb(16, 16, 28)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(&self.doc.name);
                    ui.add(egui::Slider::new(&mut self.zoom, 0.1..=4.).text("Zoom"));
                    if ui.button("Fit").clicked() {
                        self.zoom = 1.;
                    }
                });
                if let Some(texture) = &self.texture {
                    let available = ui.available_size();
                    let fit = (available.x / self.doc.width as f32)
                        .min(available.y / self.doc.height as f32)
                        .min(1.);
                    let size =
                        egui::vec2(self.doc.width as f32, self.doc.height as f32) * fit * self.zoom;
                    egui::ScrollArea::both().show(ui, |ui| {
                        ui.add(egui::Image::new((texture.id(), size)));
                    });
                } else {
                    ui.centered_and_justified(|ui| {
                        ui.label("Open your artwork or a Huelith project to begin.");
                    });
                }
            });
        if self.close_dialog {
            egui::Window::new("Unsaved artwork")
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label("Save a copy before closing?");
                    ui.horizontal(|ui| {
                        if ui.button("Save copy").clicked() {
                            self.save_copy();
                            if !self.dirty {
                                self.close_dialog = false;
                                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                            }
                        }
                        if ui.button("Keep editing").clicked() {
                            self.close_dialog = false;
                        }
                        if ui.button("Discard changes and close").clicked() {
                            self.dirty = false;
                            self.close_dialog = false;
                            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                        }
                    });
                });
        }
    }
}
fn main() -> eframe::Result {
    let input = std::env::args().nth(1).map(PathBuf::from);
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1480., 920.])
            .with_min_inner_size([960., 640.]),
        renderer: eframe::Renderer::Wgpu,
        ..Default::default()
    };
    eframe::run_native(
        "Huelith · Native Rust",
        options,
        Box::new(move |cc| Ok(Box::new(Editor::new(cc, input)))),
    )
}

//! Artist-facing editors for structured color parameters.
use eframe::egui;
use huelith_core::Effect;
use serde_json::{json, Map, Value};
type Scalar = (&'static str, &'static str, f64, f64, f64);

pub fn edit(ui: &mut egui::Ui, effect: &Effect) -> Option<Map<String, Value>> {
    let controls: &[Scalar] = match effect.kind.as_str() {
        "exposure" => &[("protect", "Protect highlights", 0., 100., 0.)],
        "levels" => &[
            ("inputBlack", "Input black", 0., 254., 0.),
            ("inputWhite", "Input white", 1., 255., 255.),
            ("gammaMid", "Midtone gamma", 0.1, 5., 1.),
            ("outputBlack", "Output black", 0., 255., 0.),
            ("outputWhite", "Output white", 0., 255., 255.),
        ],
        "balance" => &[
            ("shadowsRed", "Shadows · red", -100., 100., 0.),
            ("shadowsGreen", "Shadows · green", -100., 100., 0.),
            ("shadowsBlue", "Shadows · blue", -100., 100., 0.),
            ("midtonesRed", "Midtones · red", -100., 100., 0.),
            ("midtonesGreen", "Midtones · green", -100., 100., 0.),
            ("midtonesBlue", "Midtones · blue", -100., 100., 0.),
            ("highlightsRed", "Highlights · red", -100., 100., 0.),
            ("highlightsGreen", "Highlights · green", -100., 100., 0.),
            ("highlightsBlue", "Highlights · blue", -100., 100., 0.),
        ],
        "mixer" => &[
            ("redRed", "Red from red", -200., 200., 100.),
            ("redGreen", "Red from green", -200., 200., 0.),
            ("redBlue", "Red from blue", -200., 200., 0.),
            ("greenRed", "Green from red", -200., 200., 0.),
            ("greenGreen", "Green from green", -200., 200., 100.),
            ("greenBlue", "Green from blue", -200., 200., 0.),
            ("blueRed", "Blue from red", -200., 200., 0.),
            ("blueGreen", "Blue from green", -200., 200., 0.),
            ("blueBlue", "Blue from blue", -200., 200., 100.),
        ],
        "selective" => &[
            ("targetHue", "Target hue", 0., 360., 0.),
            ("hueWidth", "Hue range", 1., 180., 40.),
            ("hueShift", "Hue shift", -180., 180., 0.),
            ("saturationAdjust", "Saturation", -100., 100., 0.),
        ],
        "solarize" => &[
            ("threshold", "Threshold", 0., 255., 128.),
            ("transition", "Transition", 0., 128., 0.),
        ],
        _ => &[],
    };
    let mut changes = Map::new();
    for &(key, label, min, max, default) in controls {
        let mut value = effect
            .parameters
            .get(key)
            .and_then(Value::as_f64)
            .unwrap_or(default);
        if ui
            .add(egui::Slider::new(&mut value, min..=max).text(label))
            .changed()
        {
            changes.insert(key.into(), json!(value));
        }
    }
    if effect.kind == "curves" {
        if let Some(points) = curve(ui, effect) {
            changes.insert("curvePoints".into(), points);
        }
    }
    if effect.kind == "gradientmap" {
        if let Some(stops) = stops(ui, effect) {
            changes.insert("stops".into(), stops);
        }
    }
    if effect.kind == "duotone" {
        for (key, label, default) in [
            ("colorA", "Shadow ink", "#182141"),
            ("colorB", "Highlight ink", "#b579ff"),
        ] {
            let color = effect
                .parameters
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or(default);
            if let Some(color) = color_picker(ui, label, color) {
                changes.insert(key.into(), color.into());
            }
        }
    }
    (!changes.is_empty()).then_some(changes)
}
fn color_picker(ui: &mut egui::Ui, label: &str, color: &str) -> Option<String> {
    let rgb = huelith_effects::shared::hex_rgb(color).unwrap_or([1.; 3]);
    let mut rgb = rgb.map(|v| (v * 255.).round() as u8);
    let changed = ui
        .horizontal(|ui| {
            ui.label(label);
            ui.color_edit_button_srgb(&mut rgb).changed()
        })
        .inner;
    changed.then(|| format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2]))
}
fn curve(ui: &mut egui::Ui, effect: &Effect) -> Option<Value> {
    let mut points = effect
        .parameters
        .get("curvePoints")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| vec![json!({"x":0.,"y":0.}), json!({"x":1.,"y":1.})]);
    let (response, painter) = ui.allocate_painter(
        egui::vec2(ui.available_width(), 150.),
        egui::Sense::click_and_drag(),
    );
    let rect = response.rect.shrink(8.);
    painter.rect_filled(rect, 3., egui::Color32::from_rgb(15, 15, 25));
    for step in 1..4 {
        let t = step as f32 / 4.;
        let color = egui::Stroke::new(1., egui::Color32::from_gray(55));
        painter.line_segment(
            [
                rect.lerp_inside(egui::vec2(t, 0.)),
                rect.lerp_inside(egui::vec2(t, 1.)),
            ],
            color,
        );
        painter.line_segment(
            [
                rect.lerp_inside(egui::vec2(0., t)),
                rect.lerp_inside(egui::vec2(1., t)),
            ],
            color,
        );
    }
    let position = |point: &Value| {
        rect.lerp_inside(egui::vec2(
            point["x"].as_f64().unwrap_or(0.) as f32,
            1. - point["y"].as_f64().unwrap_or(0.) as f32,
        ))
    };
    for pair in points.windows(2) {
        painter.line_segment(
            [position(&pair[0]), position(&pair[1])],
            egui::Stroke::new(2., egui::Color32::from_rgb(186, 153, 255)),
        );
    }
    for point in &points {
        painter.circle_filled(position(point), 4., egui::Color32::WHITE);
    }
    let mut changed = false;
    if (response.clicked() || response.dragged()) && response.interact_pointer_pos().is_some() {
        let pointer = response.interact_pointer_pos().unwrap();
        let nearest = points
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                position(a)
                    .distance_sq(pointer)
                    .total_cmp(&position(b).distance_sq(pointer))
            })
            .map(|(i, p)| (i, position(p).distance(pointer)));
        let selected = if let Some((i, d)) = nearest {
            if response.dragged() || d < 14. {
                Some(i)
            } else {
                None
            }
        } else {
            None
        };
        let (x, y) = (
            ((pointer.x - rect.left()) / rect.width()).clamp(0., 1.),
            (1. - (pointer.y - rect.top()) / rect.height()).clamp(0., 1.),
        );
        if let Some(i) = selected {
            points[i]["x"] = json!(if i == 0 {
                0.
            } else if i == points.len() - 1 {
                1.
            } else {
                x
            });
            points[i]["y"] = json!(y);
            changed = true;
        } else if points.len() < 32 {
            points.push(json!({"x":x,"y":y}));
            changed = true;
        }
        points.sort_by(|a, b| {
            a["x"]
                .as_f64()
                .unwrap_or(0.)
                .total_cmp(&b["x"].as_f64().unwrap_or(0.))
        });
    }
    ui.small("Click to add a point. Drag to shape the tonal curve.");
    if ui.button("Reset curve").clicked() {
        points = vec![json!({"x":0.,"y":0.}), json!({"x":1.,"y":1.})];
        changed = true;
    }
    changed.then(|| Value::Array(points))
}
fn stops(ui: &mut egui::Ui, effect: &Effect) -> Option<Value> {
    let mut stops = effect
        .parameters
        .get("stops")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| {
            vec![
                json!({"id":"start","position":0.,"color":"#221142","opacity":1.}),
                json!({"id":"end","position":1.,"color":"#b579ff","opacity":1.}),
            ]
        });
    let mut changed = false;
    let mut remove = None;
    let length = stops.len();
    for (i, stop) in stops.iter_mut().enumerate() {
        ui.push_id(i, |ui| {
            let color = stop["color"].as_str().unwrap_or("#ffffff").to_string();
            if let Some(color) = color_picker(ui, &format!("Color {}", i + 1), &color) {
                stop["color"] = color.into();
                changed = true;
            }
            let mut position = stop["position"].as_f64().unwrap_or(0.);
            if ui
                .add(egui::Slider::new(&mut position, 0.0..=1.0).text("Position"))
                .changed()
            {
                stop["position"] = json!(position);
                changed = true;
            }
            let mut opacity = stop["opacity"].as_f64().unwrap_or(1.);
            if ui
                .add(egui::Slider::new(&mut opacity, 0.0..=1.0).text("Opacity"))
                .changed()
            {
                stop["opacity"] = json!(opacity);
                changed = true;
            }
            if length > 2 && ui.small_button("Remove stop").clicked() {
                remove = Some(i);
            }
        });
    }
    if let Some(i) = remove {
        stops.remove(i);
        changed = true;
    }
    if stops.len() < 32 && ui.button("Add color stop").clicked() {
        stops.push(json!({"id":format!("native-{}",stops.len()),"position":0.5,"color":"#ffffff","opacity":1.}));
        changed = true;
    }
    if changed {
        stops.sort_by(|a, b| {
            a["position"]
                .as_f64()
                .unwrap_or(0.)
                .total_cmp(&b["position"].as_f64().unwrap_or(0.))
        });
    }
    changed.then(|| Value::Array(stops))
}

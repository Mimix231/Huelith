//! Individually owned implementations. No generic "120 styles" color overlay.
//! New operations join this registry only after behavior and parameter tests.
mod pixel_sorting;
mod manga_screentones;
mod film_halation;
mod anamorphic_streak;
use super::{CpuEffect, RgbaImage};

pub fn supported(kind: &str) -> bool {
    matches!(kind, "atelier_3_12" | "atelier_4_0" | "atelier_7_0" | "atelier_7_1")
}
pub fn apply(image: &RgbaImage, fx: &CpuEffect, threads: usize) -> Result<RgbaImage, String> {
    if !(0.0..=100.0).contains(&fx.amount) || !fx.amount.is_finite() {
        return Err(format!("Invalid intensity for {}", fx.kind));
    }
    let result = match fx.kind.as_str() {
        "atelier_3_12" => pixel_sorting::render(image, fx),
        "atelier_4_0" => manga_screentones::render(image, fx),
        "atelier_7_0" => film_halation::render(image, fx, threads),
        "atelier_7_1" => anamorphic_streak::render(image, fx),
        _ => return Err(format!("Unmigrated native operation {}", fx.kind)),
    };
    Ok(result)
}

pub fn validate(fx: &CpuEffect) -> Result<(), String> {
    if !supported(&fx.kind) { return Err(format!("Unmigrated native operation {}", fx.kind)); }
    if !fx.amount.is_finite() || !(0.0..=100.0).contains(&fx.amount) {
        return Err("Effect intensity must be in the range 0 to 100".into());
    }
    if let Some(params) = &fx.parameters {
        for value in [params.threshold,params.radius,params.frequency,params.angle,params.seed,params.color_mix].into_iter().flatten() {
            if !value.is_finite() || value.abs() > 100000.0 { return Err("Invalid effect parameter".into()); }
        }
    }
    Ok(())
}

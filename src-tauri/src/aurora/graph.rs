//! Phase F: ordered, deterministic cached prefixes of a native effect stack.
//! Cache identity includes Arc source ownership, actual kind and IEEE-754 amount.
//! Only previously completed *unchanged* prefixes are reused. No lossy
//! approximations, disabled effects, or fake "fast" kernels are introduced.
use super::{CpuEffect, RgbaImage};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicUsize, Ordering};

const GRAPH_CACHE_BYTES: usize = 192 * 1024 * 1024;

pub struct GraphRegistry {
    cache: Mutex<HashMap<String, CachedGraph>>,
    budget: AtomicUsize,
}
impl Default for GraphRegistry {
    fn default() -> Self {
        Self { cache: Mutex::new(HashMap::new()), budget: AtomicUsize::new(GRAPH_CACHE_BYTES) }
    }
}

struct CachedGraph {
    source: Arc<RgbaImage>,
    signatures: Vec<(String, u32, String)>,
    stages: Vec<Arc<RgbaImage>>,
}

pub struct GraphResult {
    pub image: Arc<RgbaImage>,
    pub reused_stages: usize,
    pub cpu_stages: usize,
    pub gpu_stages: usize,
}

impl GraphRegistry {
    /// Memory budget is per retained image, with a bounded image registry.
    pub fn set_budget(&self, mebibytes: usize) -> Result<(), String> {
        if !(64..=2048).contains(&mebibytes) { return Err("Cache budget must be 64–2048 MiB".into()); }
        self.budget.store(mebibytes * 1024 * 1024, Ordering::Relaxed);
        self.clear();
        Ok(())
    }
    pub fn invalidate(&self, id: &str) {
        if let Ok(mut map) = self.cache.lock() { map.remove(id); }
    }
    pub fn register_source(&self, id: &str, source: Arc<RgbaImage>) {
        if let Ok(mut map) = self.cache.lock() {
            map.insert(id.to_owned(), CachedGraph { source, signatures: Vec::new(), stages: Vec::new() });
        }
    }
    pub fn clear(&self) {
        if let Ok(mut map) = self.cache.lock() {
            for value in map.values_mut() { value.signatures.clear(); value.stages.clear(); }
        }
    }
    pub fn run(
        &self,
        id: &str,
        source: Arc<RgbaImage>,
        effects: &[CpuEffect],
        mut operation: impl FnMut(&RgbaImage, &CpuEffect) -> Result<(RgbaImage, bool), String>,
    ) -> Result<GraphResult, String> {
        if effects.len() > 1024 { return Err("Native graph exceeds resource safety limit (1024)".into()); }
        // Validate the entire graph before considering a cached output; invalid
        // amounts and unknown operations never bypass validation on cache hit.
        for effect in effects {
            if !effect.amount.is_finite() || effect.amount.abs() > 1000.0 ||
                (!["brightness", "contrast", "saturate", "grayscale", "invert", "blur"].contains(&effect.kind.as_str()) && !super::native_effects::supported(&effect.kind)) {
                return Err(format!("Unsupported or invalid native effect: {}", effect.kind));
            }
        }
        for effect in effects {
            if super::native_effects::supported(&effect.kind) {super::native_effects::validate(effect)?;}
        }
        let signatures: Vec<(String, u32, String)> = effects.iter().map(|effect| (
            effect.kind.clone(), effect.amount.to_bits(),
            serde_json::to_string(&effect.parameters).unwrap_or_else(|_| "invalid".into()),
        )).collect();
        let (mut current, mut prefix) = {
            let map = self.cache.lock().map_err(|_| "Graph cache lock poisoned")?;
            if let Some(cache) = map.get(id).filter(|entry| Arc::ptr_eq(&entry.source, &source)) {
                let prefix = signatures.iter().zip(cache.signatures.iter()).take_while(|(a,b)| a == b).count().min(cache.stages.len());
                (if prefix > 0 { cache.stages[prefix-1].clone() } else { source.clone() }, prefix)
            } else { (source.clone(), 0) }
        };
        let mut cpu_stages = 0;
        let mut gpu_stages = 0;
        let mut produced = Vec::new();
        for effect in &effects[prefix..] {
            let (next, gpu) = operation(&current, effect)?;
            current = Arc::new(next);
            produced.push(current.clone());
            if gpu { gpu_stages += 1; } else { cpu_stages += 1; }
        }
        let reused = prefix;
        // Publish only if the retained source has not been replaced while this
        // computation ran. Old jobs cannot populate a new source's graph.
        let mut map = self.cache.lock().map_err(|_| "Graph cache lock poisoned")?;
        if map.get(id).map(|old| Arc::ptr_eq(&old.source, &source)).unwrap_or(false) {
            let existing = map.remove(id);
            let mut stages = existing.filter(|old| Arc::ptr_eq(&old.source, &source))
                .map(|mut old| { old.stages.truncate(prefix); old.stages }).unwrap_or_default();
            stages.extend(produced);
            // When a prefix exceeds the budget keep only the first stages,
            // because a later stage without its predecessors cannot be reused.
            while stages.len().saturating_mul(source.pixels.len()) > self.budget.load(Ordering::Relaxed) { stages.pop(); }
            prefix = stages.len();
            map.insert(id.to_owned(), CachedGraph {
                source, signatures: signatures.into_iter().take(prefix).collect(), stages,
            });
        }
        Ok(GraphResult { image: current, reused_stages: reused, cpu_stages, gpu_stages })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn image() -> Arc<RgbaImage> { Arc::new(RgbaImage {width: 2,height: 1,pixels: vec![10,30,80,255,40,40,40,255]}) }
    fn effect(kind: &str, amount: f32) -> CpuEffect { CpuEffect {kind:kind.into(),amount,parameters:None} }
    #[test]
    fn reuses_only_matching_prefixes() {
        let graph = GraphRegistry::default();
        let original = image();
        graph.register_source("x",original.clone());
        let a = [effect("brightness",110.),effect("contrast",120.),effect("invert",30.)];
        let count = std::sync::atomic::AtomicUsize::new(0);
        let run = |effects: &[CpuEffect]| graph.run("x",original.clone(),effects,|image,effect| {
            count.fetch_add(1,std::sync::atomic::Ordering::Relaxed);
            Ok((super::super::process(image,std::slice::from_ref(effect),1)?,false))
        }).unwrap();
        let first = run(&a); assert_eq!(first.reused_stages,0); assert_eq!(count.load(std::sync::atomic::Ordering::Relaxed),3);
        let second = run(&a); assert_eq!(second.reused_stages,3); assert_eq!(first.image.pixels,second.image.pixels);
        let changed = [a[0].clone(),a[1].clone(),effect("invert",40.)];
        assert_eq!(run(&changed).reused_stages,2);
        assert_eq!(count.load(std::sync::atomic::Ordering::Relaxed),4);
        let changed_first = [effect("brightness",130.),a[1].clone(),a[2].clone()];
        assert_eq!(run(&changed_first).reused_stages,0);
    }
    #[test]
    fn different_sources_do_not_share_pixels() {
        let graph = GraphRegistry::default();
        let source = image();
        graph.register_source("source",source.clone());
        let fx = [effect("invert",80.)];
        let render = |img| graph.run("source",img,&fx,|i,e|Ok((super::super::process(i,std::slice::from_ref(e),1)?,false))).unwrap();
        assert_eq!(render(source.clone()).reused_stages,0);
        assert_eq!(render(source).reused_stages,1);
        let other = image();
        graph.register_source("source",other.clone());
        assert_eq!(render(other).reused_stages,0);
    }
}

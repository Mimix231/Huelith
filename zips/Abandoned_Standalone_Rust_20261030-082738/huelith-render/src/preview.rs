//! Bounded latest-value queue. A drag never cancels the frame currently being
//! completed for the same source; every completed exact frame can be displayed.
use huelith_core::{Effect, Image};
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

pub struct Composition {
    pub doc: Arc<huelith_core::Document>,
    pub assets: HashMap<String, Arc<Image>>,
    pub layer_id: String,
}

pub struct Request {
    pub revision: u64,
    pub source_id: u64,
    pub source: Arc<Image>,
    pub effects: Vec<Effect>,
    pub composition: Option<Arc<Composition>>,
}
pub struct Frame {
    pub revision: u64,
    pub source_id: u64,
    pub image: Result<Arc<Image>, String>,
    pub processing_ms: f64,
    pub reused: usize,
}
struct State {
    pending: Option<Request>,
    stopped: bool,
}
pub struct PreviewWorker {
    state: Arc<(Mutex<State>, Condvar)>,
    results: Arc<Mutex<Option<Frame>>>,
    thread: Option<JoinHandle<()>>,
}
impl PreviewWorker {
    pub fn new(wake: impl Fn() + Send + 'static) -> Self {
        let state = Arc::new((
            Mutex::new(State {
                pending: None,
                stopped: false,
            }),
            Condvar::new(),
        ));
        let shared = state.clone();
        let results = Arc::new(Mutex::new(None));
        let completed = results.clone();
        let thread = std::thread::spawn(move || {
            let mut last_source: Option<Arc<Image>> = None;
            let mut stages: Vec<(String, Arc<Image>)> = Vec::new();
            loop {
                let request = {
                    let (lock, ready) = &*shared;
                    let mut guard = lock.lock().unwrap();
                    while guard.pending.is_none() && !guard.stopped {
                        guard = ready.wait(guard).unwrap();
                    }
                    if guard.stopped {
                        break;
                    }
                    guard.pending.take().unwrap()
                };
                let started = Instant::now();
                let mut reused = 0;
                if !last_source
                    .as_ref()
                    .is_some_and(|p| Arc::ptr_eq(p, &request.source))
                {
                    stages.clear();
                }
                last_source = Some(request.source.clone());
                let mut current = request.source.clone();
                let mut new_stages = Vec::new();
                let mut error = None;
                let mut prefix = true;
                for effect in request.effects.iter().filter(|e| e.enabled) {
                    let signature = serde_json::to_string(effect).unwrap();
                    let index = new_stages.len();
                    if prefix && stages.get(index).is_some_and(|s| s.0 == signature) {
                        current = stages[index].1.clone();
                        reused += 1;
                    } else {
                        prefix = false;
                        match huelith_effects::apply(&current, effect) {
                            Ok(image) => current = Arc::new(image),
                            Err(e) => {
                                error = Some(e.to_string());
                                break;
                            }
                        }
                    }
                    new_stages.push((signature, current.clone()));
                }
                let mut bytes = 0;
                new_stages.retain(|(_, im)| {
                    bytes += im.pixels.len() * 16;
                    bytes <= 192 * 1024 * 1024
                });
                stages = new_stages;
                let result = if let Some(error) = error {
                    Err(error)
                } else if let Some(scene) = &request.composition {
                    crate::document_with_override(
                        &scene.doc,
                        &|url| {
                            scene
                                .assets
                                .get(url)
                                .cloned()
                                .ok_or_else(|| anyhow::anyhow!("Missing image asset"))
                        },
                        Some((&scene.layer_id, &current)),
                    )
                    .map(Arc::new)
                    .map_err(|e| e.to_string())
                } else {
                    Ok(current)
                };
                let frame = Frame {
                    revision: request.revision,
                    source_id: request.source_id,
                    image: result,
                    processing_ms: started.elapsed().as_secs_f64() * 1000.,
                    reused,
                };
                *completed.lock().unwrap() = Some(frame);
                wake();
            }
        });
        Self {
            state,
            results,
            thread: Some(thread),
        }
    }
    pub fn submit(&self, request: Request) {
        let (lock, ready) = &*self.state;
        lock.lock().unwrap().pending = Some(request);
        ready.notify_one();
    }
    pub fn drain(&self) -> Vec<Frame> {
        self.results.lock().unwrap().take().into_iter().collect()
    }
}
impl Drop for PreviewWorker {
    fn drop(&mut self) {
        let (lock, ready) = &*self.state;
        lock.lock().unwrap().stopped = true;
        ready.notify_one();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

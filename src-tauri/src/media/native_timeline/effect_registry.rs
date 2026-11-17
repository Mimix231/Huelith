//! Explicitly implemented, dispatchable native pixel effects.
//! This list is the only supported-effect authority. The check script generates
//! a TypeScript manifest and verifies that every entry has a compositor branch.
//! Adding a name without implementing its behavior fails the contract test.
pub const IMPLEMENTED: &[&str] = &[
    "brightness", "contrast", "saturation", "saturate", "grayscale", "invert",
    "sepia", "exposure", "gamma", "video-filter", "outline",
    "pixelate", "boxblur", "posterize", "solarize",
];
pub fn supports(kind: &str) -> bool { IMPLEMENTED.contains(&kind) }

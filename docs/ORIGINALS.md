# Spectrum Originals — integrated creative tools (0.1 development build)

Spectrum Originals are **not** 10 presets for ordinary image filters. They are retained, non-destructive creative objects that can be edited after saving and reopening `.spectrum` documents. They use the same renderer in the canvas and in PNG/APNG/PNG-sequence exports.

## Opening the tools

Use **Creative → Open Spectrum Originals**, select an individual entry under **Creative**, or press the sparkle icon in Spectrum's compact titlebar. The dock floats over the canvas and can be closed. Use the library to add creative objects; click an applied object to edit it. Select the crosshair marker on the canvas and drag it to move the object's center. For Living Ink, use **Draw an editable path**; afterward drag individual path vertices directly on the canvas.

All controls update their corresponding retained object. Numeric changes have live previews during dragging and commit when released. With animation enabled, editing numeric/color controls automatically creates a keyframe at the current timeline frame. Click the ◆ control beside a property to add an explicit keyframe. Existing keyframe values interpolate across frames. Animation's existing drag playhead selects the current frame, and frame thumbnails indicate selected Original keyframes.

## Ten differentiated engines

| Tool | What is implemented | Animation behavior |
|---|---|---|
| Color Sculptor | Localized hue-targeted pixel recoloring with hue range, feather, tonal preservation. | Keyframe position, radius, target hue and replacement color. |
| Atmosphere Lab | Seven distinct deterministic particle/field behaviors: miasma, mist, smoke, embers, magic energy, frost branches, dust. Wind/density/turbulence. | Particle movement evolves with timeline frame, stable seeds prevent arbitrary flicker. |
| Light Sculptor | Positionable radial/conical light field, colored falloff, radius, direction, wrap/spread. | Keyframe light position, direction, radius, color and strength. |
| Material Forge | Six procedural geometric materials (crystal, brushed metal, ice, fabric, stone, energy) with adjustable geometry and roughness. | Keyframe material parameters; fixed seed keeps pattern positions stable. |
| Shock Designer | Four distinct spatial deformation modes (lens shock, impact ring, fracture bands, spiral collapse), adjustable distortion and chromatic displacement. | Deformations use timeline phase and keyframed strength/position. |
| Living Ink | Editable point-based variable-width ink, taper, texture, reveal amount, canvas path drawing and draggable control points. | Keyframe `reveal` to animate stroke construction. |
| Motion Echo | Samples actual earlier cels to generate colored temporal silhouettes; history, decay and offset controls. | Requires animation project with previous frames. Rendered consistently in animation exports. |
| Palette Flow | Distorted, multi-color flowing field with angle, wave frequency, deformation, speed. | Deterministic field evolves through frame indices. |
| Scene Cards | Attach depth to a layer and move it with independently controlled virtual camera X/Y; per-layer parallax. | Keyframe camera position and depth. |
| Time Sculptor | Shared keyframe tracks for object properties plus layer-linked position, scale, rotation and opacity. | Numeric properties interpolate; compatible color values interpolate channel-wise. |

## Architectural behavior

- `src/editor/creative.ts`: object types, defaults, bounded serialization checks, keyframe interpolation, time evaluation.
- `src/editor/creative-render.ts`: separate renderers for the ten systems; `paintCreativeLayer` applies scene-depth and transform controls to linked layers.
- `src/components/CreativeLab.tsx`: compact creator, editor, presets/material modes, keyframing and object list.
- `src/components/Canvas.tsx`: exact document-space crosshair, editable ink nodes and consistent preview composition.
- `src/components/AnimationTimeline.tsx`: existing scrubber, keyframe markers and direct access to the creative editor.
- `src/editor/animation.ts`: frame exports retain a reference to animation cels so Motion Echo can sample preceding frames.
- `.spectrum` version **remains 1**, with optional `creative` objects and optional transient `creativeFrame`; old documents without those fields remain valid. No destructive migration is required.

## Known limitations / truthful release status

This is a usable **development implementation**, not a claim of ten fully professional simulation engines. Color Sculptor is hue-guided pixel transformation, not semantic object segmentation. Lighting and materials use stylized 2D fields rather than recovered physical geometry. Shock Designer uses a local CPU pixel transform, which can be expensive on large radii. Living Ink is editable polyline geometry rather than full dynamic Bézier width profiles. Motion Echo is frame-sampling, not optical flow. Scene Cards do not reconstruct occluded backgrounds. Time Sculptor interpolates supported numeric and color controls; unrelated strings, raster shapes and topology changes do not interpolate. The general effects system and rendering bottlenecks outside these modules are separate work.

**SVG export:** Original procedural fields are drawn by Canvas2D. Use PNG or animation image exports for faithful appearance; the SVG-only exporter cannot encode the procedural results as editable native SVG constructs.

**Unverified:** Full dependency-aware TypeScript, Vite/Tauri production builds, installed-font/native controls, Windows UI performance and complete React E2E. Do not label this build Spectrum 1.0 until these succeed.

## Verification

Run `npm run test:originals` for model/serialization unit tests plus real Chromium Canvas2D pixel assertions. Run `npm run verify`, `npm run test:browser`, `npm run test:timeline`, `npm run test:ui`, and `npm run desktop:build` before distributing a Windows release. The browser test needs Python Playwright and Chromium.

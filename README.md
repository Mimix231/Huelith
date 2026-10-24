![Spectrum Image](DrawingArtwork.png)

## Everything underneath this is written by ChatGPT.
## Spectrum was built using ChatGPT Chat.
## If you notice something wrong, Feel free to post that in [Issues], the more observations, the better.

# 🌈 Spectrum
### Create Without Limits.
**A free, open-source image editor built for creativity, precision, and freedom.**
**Version 0.1.0 · Public Alpha**

Spectrum is a modern desktop image editor that brings together raster editing, vector graphics, typography, animation, creative filters, and advanced visual effects inside one application.
Built with **Tauri, React, TypeScript, Material UI, and Rust**, Spectrum aims to combine an approachable editing experience with increasingly powerful native image-processing technology.
Whether you're creating digital artwork, designing graphics, experimenting with atmospheric lighting, editing photographs, or animating illustrations, Spectrum is designed to give you the tools to explore your ideas.
No subscriptions. No locked features. No mandatory accounts.

**Just creativity.**

---

## ✨ Why Spectrum?
Professional creative software should be accessible.

Spectrum is being developed around a straightforward philosophy:
**Powerful creative tools shouldn't require expensive subscriptions or powerful graphics cards just to be usable.**

Spectrum aims to provide a capable editing environment where users can experiment freely, build their own creative workflows, and retain control over their artwork.

### Our principles
* **Completely free:** No subscriptions, premium tiers, or artificial feature restrictions.
* **Non-destructive editing:** Experiment with effects without permanently changing the original layer content.
* **Hardware flexibility:** Support CPU-based processing alongside optional GPU acceleration.
* **Creative freedom:** Combine filters, effects, artwork, typography, and animation.
* **User-focused development:** Prioritize visual quality, practical functionality, and responsive editing.

Spectrum is still evolving, but these principles guide its development.

---

# 🎨 Features
## 🖼️ Raster & Vector Editing

Spectrum combines traditional image editing with editable graphic elements.
Create and modify artwork using tools designed for both pixel-based and object-based workflows.

### Editing capabilities
* Raster image layers and image importing.
* Editable rectangles, ellipses, lines, and vector paths.
* Bézier curve editing.
* Layer ordering, visibility, locking, and opacity.
* Layer blending and non-destructive effects.
* Image cropping and transformations.
* Brush tools with adjustable smoothing.
* Undo and redo history.
* Canvas zoom, navigation, and visual guides.
* Clipboard integration for copying and pasting artwork.

Spectrum uses a layered document model so artwork can remain editable throughout the creative process.

---

## ✏️ Advanced Typography

Typography is more than placing words on an image.
Spectrum includes an editable text system designed for graphic design, posters, thumbnails, artwork, and visual compositions.

### Focus Text
Focus Text provides a dedicated editing environment for working with typography.

Features include:
* Native text caret and direct typing.
* Font selection.
* Font weight and styling.
* Text alignment and paragraph formatting.
* Decorations and background styling.
* Text shadows.
* Letter and shape transformations.
* Adjustable text positioning.
* Selection, dragging, scaling, and rotation.

Existing text can be selected with a single click and opened for editing with a double-click.
Spectrum also supports non-destructive visual effects on text layers, allowing typography to interact with glow, shadows, outlines, and other effects.

---

# 🌟 Creative Studio

Spectrum's Creative Studio organizes its image-processing capabilities into three major areas:

| Category       | Purpose                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| **Creativity** | Image adjustments, artistic filters, color processing, and stylization           |
| **Effects**    | Layer-oriented transformations, illumination, outlines, shadows, and backgrounds |
| **FX**         | Distinctive visual effects for dramatic and experimental artwork                 |

Each effect can expose adjustable parameters, allowing users to customize its appearance instead of relying on a single predefined result.

## 🎚️ Non-Destructive Effect Editing

Spectrum's effects are designed to remain adjustable.
Depending on the selected operation, users can modify properties such as intensity, radius, opacity, color, angle, softness, falloff, distortion, and procedural detail.

The FX Studio also includes:
* **Basic and Advanced controls** for different editing needs.
* **Effect presets** that can be saved and reused.
* **Before/After comparison** for evaluating changes.
* **Individual effect visibility** and reset controls.
* **Reorderable effect processing** within the layer stack.

The editor preserves effect parameters in Spectrum project files.

---

# 💜 Advanced Layer Effects

Spectrum includes seven dedicated Effects-tab tools.

### Hyper Outline

More than a conventional border.
Hyper Outline offers subject-aware outlining with multiple creative treatments, including:

* Classic outlines.
* Neon outlines.
* Double outlines.
* Electric treatments.
* Soft outlines.
* Gradient-based outlines.
* Multiple independently colored rings.

Users can customize thickness, spacing, edge sensitivity, color, and other properties.

### Spectrum Glow

Create illumination around artwork, text, and visual elements.
Supported glow treatments include traditional outer and inner glow, combined illumination, bloom, atmospheric glow, and energy glow.
Adjustments include glow radius, spread, color, intensity, softness, and falloff.

### Shadow Forge

An advanced shadow system supporting multiple shadow styles and configurable shadow entries.
Available treatments include drop shadows, inner shadows, contact shadows, long shadows, and perspective-based shadows.

### Holy Radiance

Create dramatic, directional illumination with procedural atmospheric lighting and controllable light rays.

### Miasma

Generate atmospheric darkness, smoke-like procedural structures, and turbulent cloud effects with adjustable positioning and intensity.

### Backdrop

Add configurable backgrounds, including solid colors, linear gradients, radial gradients, and adjustable gradient stops.

### Remove Background

Remove relatively uniform connected backgrounds using adjustable edge processing and optional color-spill cleanup.

**Note:** Background removal currently uses heuristic image processing rather than machine-learning subject segmentation. Complex photographic backgrounds may require additional manual editing.

---

# ⚡ Spectrum Visual FX

Spectrum currently includes **22 signature Visual FX processors**.
These effects are designed for artwork that needs something beyond conventional image adjustments.
The library includes neon treatments, digital distortions, atmospheric effects, illumination, and other stylized transformations.

## 🌌 New in Project Aurora II

Seven additional signature effects expand Spectrum's creative possibilities.

| Visual FX               | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| **Plasma Veins**        | Electric filaments influenced by image detail and turbulence |
| **Nebula Bloom**        | Atmospheric clouds and colorful illumination                 |
| **Spectral Refraction** | Directional RGB separation and refracted color effects       |
| **Rift Distortion**     | Spatial twisting and distortion around a configurable center |
| **Inferno Aura**        | Fiery illumination and ember-like edge patterns              |
| **Crystal Resonance**   | Angular crystalline structures and faceted highlights        |
| **Liquid Light**        | Flowing ribbons of stylized light                            |

Existing signature effects include tools such as Neon Pulse, Glitch Matrix, Dream Bloom, Spectrum Burst, Aurora Flow, and Electric Edge.
Every signature FX is designed to remain configurable and editable within the layer-effects workflow.

---

# 🎭 Creativity Filters & Artistic Styles

Spectrum includes an expanding library of color adjustments, detail enhancements, textures, and stylization tools.
Traditional operations include brightness, contrast, saturation, blur, sharpening, color balance, curves, levels, and other image adjustments.
More experimental tools include painterly processing, graphic stylization, pixel-inspired rendering, glitch treatments, and procedural visual effects.

## Seven Additional Creativity Styles

The last implementation includes:

| Style                | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Anime Cel Studio** | Cel-shaded artwork with configurable shading bands                |
| **Graphic Novel**    | Ink-inspired rendering and graphic contrast                       |
| **Holographic Foil** | Iridescent highlights and flowing reflections                     |
| **Chromatic Silk**   | Smooth multicolor transitions and directional color flow          |
| **Pixel Poster**     | Pixel-inspired graphics with adjustable grid and palette settings |
| **Ink Wash**         | Stylized pigment diffusion and ink-like effects                   |
| **Retro Dreamscape** | Atmospheric vintage coloring and grain                            |

These styles use their own image-processing logic and adjustable parameters.
They are not simply static color presets.

---

# 🌈 Spectrum Originals

Spectrum Originals is a collection of ten creative systems built around more specialized editing experiences.

| Spectrum Original  | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| **Color Sculptor** | Localized, hue-guided recoloring                   |
| **Atmosphere Lab** | Procedural atmospheric particles and fields        |
| **Light Sculptor** | Positionable and configurable lighting             |
| **Material Forge** | Procedural material-like visual treatments         |
| **Shock Designer** | Impact-based image deformation                     |
| **Living Ink**     | Editable ink paths with reveal controls            |
| **Motion Echo**    | Temporal silhouettes derived from animation frames |
| **Palette Flow**   | Flowing, distorted multicolor fields               |
| **Scene Cards**    | Layer depth and camera-controlled parallax         |
| **Time Sculptor**  | Timeline-driven creative property animation        |

These systems support different combinations of positioning, parameters, keyframes, procedural rendering, and direct canvas interaction.
Spectrum Originals is intended to expand the possibilities of traditional image editing without requiring users to move between several applications.

**Some systems are stylized 2D implementations rather than physically based simulation engines.**

See [Spectrum Originals documentation](docs/ORIGINALS.md) for technical details.

---

# 🎞️ Animation Studio

Spectrum includes animation capabilities for frame-based creative projects.

Features include:
* Frame timeline.
* Timeline navigation and scrubbing.
* Frame-by-frame editing.
* Onion skinning.
* Animation cel management.
* Supported property keyframes.
* Creative effect animation.
* Timeline-integrated Spectrum Originals.

Onion skinning helps artists see surrounding frames while working on the current drawing.
Supported animated properties can be evaluated across frames to produce changing positions, colors, lighting, and other effects.
Animation features are still undergoing development and compatibility testing.

---

# ⚙️ Application Settings

Spectrum includes a compact settings interface organized into nine categories.

| Category        | Configuration                                                   |
| --------------- | --------------------------------------------------------------- |
| **Appearance**  | Themes, interface presentation, and visual preferences          |
| **Performance** | Acceleration preferences, CPU settings, caches, and diagnostics |
| **Canvas**      | Workspace and canvas preferences                                |
| **Editing**     | Editing behavior and tool preferences                           |
| **Effects**     | Effect-related settings                                         |
| **Animation**   | Animation preferences                                           |
| **Storage**     | Local storage and recovery settings                             |
| **Shortcuts**   | Keyboard shortcut preferences                                   |
| **About**       | Application information                                         |

Settings are designed to complement Spectrum's translucent interface and colorful themes.
Performance settings can be adjusted independently of project content.

---

# 💾 Project Files & Exporting

Spectrum uses its own native project format:

**`.spectrum`**

This format stores the editable document structure, including supported layers, objects, effect parameters, and creative data.
Spectrum also supports common image-import and export workflows, including raster output.
SVG export is available for supported vector content, although raster-only effects are not fully represented as editable native SVG effects.

### Non-destructive workflow
Applied effects are stored as editable operations whenever supported by the document model.
This allows users to return to existing effects and change their settings without permanently modifying the underlying source artwork.

---

# 💻 Getting Started

Basically download the latest release and install it to where-ever you want it.
After that open Spectrum and you're good to go.

---

# 🔒 Privacy & Accessibility

Spectrum is designed to provide creative tools without mandatory user accounts or subscription services.

Project files and editing operations are intended to remain under the user's control.

The application also aims to remain accessible to people using computers without dedicated graphics cards.

Hardware acceleration is optional for supported native operations, and CPU processing remains an important part of the project's direction.

Actual performance depends on the user's processor, graphics hardware, memory, artwork resolution, and enabled effects.

---

# 📜 License

Spectrum is released under the **GNU General Public License version 3 (GPL-3.0)**.

See the [LICENSE](LICENSE) file for the complete license text.

You are free to use, study, modify, and redistribute the software under the applicable license terms.

Spectrum is intended to remain free and open source.

---

### 🌈 Spectrum — Create Without Limits.

**Free to create. Free to experiment. Free to imagine.**

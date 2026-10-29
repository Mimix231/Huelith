# Huelith v0.2-alpha — Meme Creator and Modern Workspace

## Editable design pipeline

Use the visible **Meme Creator** titlebar button, the **Meme** launcher on the left rail, **Creative → Open Meme Creator**, **Edit → Create Meme**, or **Ctrl+Alt+M** (also available in the canvas right-click menu). The dedicated Huelith Meme Creator workspace features nine layouts (Classic Impact, Reaction, Demotivational, Comic Panel, Speech Bubble, Caption Card, Split Reaction, Before / After, Freeform). Original image pixels are never rewritten.

A live Canvas2D composition preview shows actual Huelith vector shapes and captions. Configure text, font family, size, outlines, layout opacity, colors and safe margins. Drag in the upper or lower half of the preview to offset that caption. Comparison layouts accept an optional PNG/JPEG/WebP second image within input size limits.

Click **Create editable meme** to add independent layers in one undoable document operation:
- `Meme • Comparison image` (optional separate raster)
- `Meme • Layout` (editable vector geometry)
- `Meme • Editable captions` (editable native vector text)

Double-click native text to edit it, or move/transform it with the main canvas tools. Save the project as `.huelith` to retain editability. Meme Export PNG/JPEG/WebP shortcuts reuse the standard Huelith export pipeline and transparency handling.

When the document is an animation, the initial captions and template geometry are inserted on all existing frames. Editing a cel afterward follows the existing animation exposure model. Persistent effects remain owned by the animation layer rather than individual frames.

**Compatibility:** This adds no new required project schema fields, does not remove earlier layers, and does not replace any existing renderers. Older `.spectrum` documents remain valid.

## Comfortable desktop interface

The workspace now uses consistent theme-native material surfaces, subtle depth, keyboard-focus cues, compact input controls and theme-specific emblems. All 13 themes retain distinct identities. Sakura uses blush, pearl-white and purple in its light variant; plum, violet and pastel-pink in its dark variant, with a subtle petal motif on the workspace background.

**Transform handles outside the canvas:** Users may drag an existing selected layer's resize or rotate handles even when they extend beyond the document boundary. Free clicking/drawing/selection outside the document is still disallowed. Panning remains available.

**Accessibility:** UI responds to reduced-motion preferences, uses semantic theme variables and honors keyboard navigation/visible focus cues.

## Tests and current limitations

- Node tests: `NODE_PATH=$(npm root -g) npm test`.
- Render tests: `NODE_PATH=$(npm root -g) python tests/meme-creator-browser.py`.
- Source syntax: `npm run check:source`.
- Full dependency-aware application TypeScript: `npm run check`.

A full TypeScript check and Tauri/Windows build require installed npm packages and a native Rust toolchain. Node-only tests and Chromium Canvas2D pixel checks are not substitutes for interactive desktop testing. Manual accessibility checks should include smaller windows and all 13 themes.

Meme text is native vector text and can be edited after applying. The live preview is computed at a capped raster resolution for responsiveness; exported artwork uses document resolution. Fonts can vary with installed system fonts. No AI-based automatic caption generation is included; the user controls the copy.

## Launchers and emblem alignment

Meme Creator is accessible from the titlebar and the tool rail. They open the existing non-destructive creator rather than creating another editor. The Huelith theme emblem uses centered glyph geometry inside a stable square, preserving individual theme symbols without offsetting the outer badge. Comparison-image preview updates after asynchronous image decoding completes.

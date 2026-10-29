# Huelith Animation Studio — Layer Timeline, Exposures and Playback

## Workflow
Open a frame-by-frame project and switch the timeline to the **Layers** view. The exposure sheet displays the project layers as rows and frames as columns. Click a cell to select the frame and layer together. The frame thumbnail strip remains available through the view switch.

### Held drawings
Alt-click or right-click a raster/vector cel after frame 1 to link it to the preceding frame's drawing. The cel displays a held-exposure symbol. This saves duplicate image data and remains tied to the original drawing even if it changes later. **Editing the held cel automatically detaches it:** the new pixels/shapes belong to the current cel; earlier frames are untouched. Use **Hold selected** and **Release holds** to operate on multiple highlighted frame columns. The hold always references frame IDs, not brittle frame positions.

A raster/vector layer's effects, FX, masks, visibility and blend mode remain track-wide where existing Huelith behavior already provides that; a hold only references the drawing (image and dimensions or vector paths). Gradient layers continue to use the canonical track gradient and do not require holds. Saved frames with no holds remain compatible with older files.

### Frame editing
Click a frame; Shift-click another to select a range, or Ctrl-click to toggle individual frames. Use **Duplicate selected**, **Delete selected**, **Apply timing**, or give the current frame a **Label**. At least one frame is always kept. Clearing a single cel removes its artwork, not its FX. Undo and redo apply to all these operations.

### Playback
Choose **Loop**, **Ping-pong**, or **Once**, and select the first and last frame with the **In/Out** fields. Frame durations are authoritative. Ping-pong does not repeat either endpoint between the forward and reverse runs. Playback uses a monotonic frame clock; it does not add time for effect computation. Paused playback preloads nearby raster sources during browser idle time, and visible previews reuse Huelith's exact effect cache.

### Saving, export and migration
Held drawings and frame labels are stored in the standard editable `.huelith` document model and validated on load. Rendering and exporting use the same held-cel resolver, with canonical layer effects and Gradient recipes. Old projects lacking new fields default to full-range loop playback without linked holds.

### Known limitations
- There is no audio-track editor or camera keyframing in this pass.
- Onion-skin previous/next controls remain frame-based; per-layer tint and onion exposure painting can be extended later.
- GPU-heavy 4K filters can still limit real-time playback. Frame predecoding reduces image-load stalls, but is not an acceleration of heavy effect algorithms.
- Layer-based cel editing is raster/vector drawing exposure, not effect-parameter keyframing.
- Full React/MUI Windows/Tauri build and live FPS testing requires the complete installed toolchain.

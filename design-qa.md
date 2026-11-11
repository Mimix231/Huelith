# Video Studio design QA

The source is the supplied 1672 × 941 Night Run reference, mirrored in [night-run-concept.png](docs/video-studio-design/night-run-concept.png). The implementation capture is `screenshot-0` in the Windows tool result titled “Verifying the final Windows layout against the supplied screenshot.” It shows the 1667 × 944 native window at desktop scale. The comparison uses both captures at their original density and also checks the 1502 × 922 window. The CSS viewport was approximately the native client area.

Both final views show the Effects tab with Electric Edge selected, Clip open, Strength 0.75, Glow 0.60, and the playhead at `00:00:12.34` in a 28-second 1080p60 timeline. The native view uses a separate test project with decoded H.264 shots, an applied transition, editable titles, and an audio clip.

## Comparison

- **Layout and spacing.** The title bar, eight library tabs, two-column card grid, letterboxed monitor, Inspector, single timeline toolbar, track headers, and status strip follow the reference. The initial native view had a crowded player display, a square effect switch, and tracks compressed by tool rows. The final capture shows separated monitor controls, the pill switch, and a full-height timeline with additional commands in Timeline tools.
- **Typography and copy.** Segoe UI keeps the Windows editor readable at both sizes. The same card order and inspector labels are visible. The save label, timecode, clip names, and duration reflect the project. The app keeps a Transitions inspector section and a Timeline tools entry for existing controls.
- **Palette and state.** Graphite panels, lavender selection and playhead accents, and purple, teal, and green clip lanes are visible. The revised inspector has lavender range fills and white thumbs. The timeline overview shows density from the actual edit and the dashed line aligns with the transition cut.
- **Artwork and waveforms.** Card images come from the Night Run artwork and the production renderer. The real test frame has a different crop and edge pattern from the illustration. The audio envelope follows the test audio's available peak data and has a different profile from the reference. These are content differences. Minor differences in icon glyphs, card cropping, and the fit margin remain.

## Interaction checks

- Playback crossed the transition, advanced the playhead, and updated the master audio meter. A native playhead drag landed on a frame. Ctrl+B split the selected video at that frame.
- A Strength drag changed 0.75 to 0.28, and one Undo restored 0.75. The preview updates with draft frames during interaction and settles at full resolution. A mixed playback run reported 67.1 ms P95 request-to-draw latency at adaptive quality after the initial seek. Latency varies by clip and effect.
- Dropping a transition at a cut preserved both clip placements in the earlier Windows pass. The automated checks also cover start, end, and middle drop geometry.
- Export finished through the Windows queue and appeared on the finished shelf. `ffprobe` confirmed 30 frames of 1920 × 1080 H.264 at 60 fps with AAC and a separate 0.5-second PCM stem. The range contained a chapter and had no captions.

The desktop comparison has no remaining blocking layout findings.

final result: passed

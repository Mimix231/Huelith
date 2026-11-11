# Night Run card audit

The standalone Night Run portrait and its transparent companion are the sources for the video library. The card generator runs the same effect and filter processors used by the player and encoder. Card settings travel with the card when it is applied. Replacing a filter with a different look starts at that look’s illustrated strength. Selecting the same look keeps its authored controls.

| Cards | Count | What was rendered |
| --- | ---: | --- |
| Effects and FX | 223 | Each effect on its card source and on an opaque preview frame |
| Filters | 270 | Every LUT on the portrait at full strength |
| Text styles | 96 | Each template through the editable text renderer |
| Motion | 16 | A representative frame from each motion preset |
| Transitions | 27 | The two Night Run shots blended at the transition midpoint |

Every effect changes its illustrated sample. Backdrop fills transparency and leaves a completely opaque frame unchanged. Its card and inspector identify the transparency requirement. Temporal cards use moving frames to demonstrate history, so the trail depends on motion in the footage. Electric Edge demonstrates the actual silhouette result on a transparent source. On opaque footage, it follows luminance edges.

The render pass exposed weak or missing results on dark and opaque footage. Frostbite now uses the source’s edges and highlights for opaque footage. Shadow Forge can cast a shadow from darker shapes and the layer Shadow preset includes an inner shadow. Electric Edge’s Glow control changes the rendered light. The Paper Ink and Dream Bloom cards use visible paper edges and tinted bloom, respectively. The legacy cutout stays readable in authored projects and has been removed from new effect choices.

`node scripts/render-video-library.cjs` regenerates the WebP files and their manifest. The manifest records each render’s preset parameters, file hash, and measured pixel change. The full suite also checks distinct LUT output, alpha preservation, real transition compositing, and the card files’ hashes.

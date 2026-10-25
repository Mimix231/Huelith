![Huelith artwork](DrawingArtwork.png)

# 🌈 Huelith

[Watch the YouTube demo](https://www.youtube.com/watch?v=NJN9pCHdxZ4)

Huelith is my free and open-source image editor. I’m building it to bring visual effects and creative tools to image editing, and to make it usable on both CPU-only systems and machines with a compatible GPU.

I’ve always believed people should be able to explore their creativity without worrying about subscriptions or cancellation fees. AI-assisted edits can be useful, but generated results can still have visible artifacts. I want Huelith to make it easier to create a YouTube thumbnail, edit a selfie, or make an image your own.

I also included an Animation Studio for frame-by-frame projects alongside the image editor. I first implemented animation by accident, then decided to keep it.

**Have fun using my app!**

![Huelith’s editing workspace with artwork on the canvas, tool rail, layers, and inspector](docs/screenshots/editor-overview.jpg)

## What you can do

- Edit raster artwork with brush and eraser tools, image imports, and adjustable layers.
- Create and transform vector shapes and paths, and edit Bézier nodes.
- Add editable text with font, alignment, decoration, background, and shadow controls.
- Work with image filters, layer effects, and signature FX.
- Build frame-by-frame animations with a timeline and onion-skin controls.

## Effects and filters

The editor groups its image tools into **Creativity**, **Effects**, and **FX**. Creativity contains image adjustments and stylized filters. Effects includes layer tools such as outlines, glows, shadows, and backdrops. The FX library includes options such as Aurora Flow and Neon Pulse.

![Huelith FX showing Aurora Flow controls and a live artwork preview](docs/screenshots/huelith-studio.jpg)

Effect controls vary by tool. The FX editor can preview changes before applying them and keeps applied FX in the layer’s editable effect stack.

Background removal uses heuristic processing for connected, relatively uniform backgrounds; it is not machine-learning subject segmentation. Complex images may need manual cleanup.

## Text and vector artwork

Text is stored as editable vector content. Focus Text provides a dedicated editing surface with type, paragraph, decoration, background, shadow, and transform controls.

![Focus Text editing a two-line title with shadow controls](docs/screenshots/focus-text.jpg)

## Animation Studio

The frame timeline includes playback, FPS and frame-duration controls, scrubbing, frame reordering, blank and duplicate frames, and onion skinning.

![Animation timeline with artwork on the active frame and three frame thumbnails](docs/screenshots/animation-timeline.jpg)

Animation export supports animated PNG (APNG), a PNG sprite sheet, or a ZIP of PNG frames. Exports are currently limited to 300 frames and 120 million total frame pixels.

## Project files and export

Huelith saves editable documents in its versioned `.Huelith` project format. It can import PNG, JPEG, WebP, GIF, and BMP images, and export PNG, JPEG, WebP, and SVG. SVG export preserves vector shapes and embeds raster image content; effects are not represented as editable SVG effects.

## CPU and GPU processing

The native Tauri backend offers CPU processing and optional GPU acceleration for a limited set of operations: brightness, contrast, saturation, grayscale, invert, and blur. The wider filter and FX library does not run through this GPU backend. Performance settings include backend selection, CPU-thread options, and diagnostics.

## Run from source

Install Node.js and npm, then start the browser-based editor:

~~~sh
npm install
npm run dev
~~~

Vite prints the local URL. To run the Tauri desktop app in a configured native development environment:

~~~sh
npm run desktop:dev
~~~

For a type check, test run, and production build:

~~~sh
npm run check
npm test
npm run build
~~~

## Project status

Huelith is in early public alpha. Features and performance are still evolving, and bugs or unfinished workflows are expected.

If you notice something wrong, please post it in [Issues](https://github.com/Mimix231/Huelith/issues). Reports and observations are helpful.

## License

Huelith is distributed under the GNU General Public License, version 3. See [LICENSE](LICENSE).

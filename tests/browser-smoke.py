"""Real Chromium Canvas2D smoke test. Requires `pip install playwright` + a Chromium executable."""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

bundle = sys.stdin.read()
with sync_playwright() as playwright:
    # Prefer a system Chromium locally; CI may use the bundled Playwright browser.
    chromium_path = os.environ.get('CHROMIUM_PATH')
    if not chromium_path and os.path.exists('/usr/bin/chromium'):
        chromium_path = '/usr/bin/chromium'
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if chromium_path:
        launch['executable_path'] = chromium_path
    browser = playwright.chromium.launch(**launch)
    try:
        page = browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=bundle)
        checks = page.evaluate(r'''async () => {
          const engine = window.HuelithTest;
          const results = [];
          function assert(name, condition) {
            if (!condition) throw new Error(`Canvas pixel assertion failed: ${name}`);
            results.push(name);
          }
          function canvas(width = 80, height = 80) {
            const element = document.createElement('canvas');
            element.width = width;
            element.height = height;
            return element;
          }
          function pixel(element, x, y) {
            return [...element.getContext('2d').getImageData(x, y, 1, 1).data];
          }
          function vectorLayer(shape) {
            return {
              id: 'layer', name: 'Vector', visible: true, locked: false,
              opacity: 1, blend: 'source-over', x: 0, y: 0, type: 'vector', shapes: [shape],
            };
          }
          const basic = canvas();
          const rect = {
            kind: 'rect', id: 'rect', x: 10, y: 10, width: 30, height: 30,
            fill: '#ff0000', stroke: 'none', strokeWidth: 0,
          };
          engine.renderLayer(basic.getContext('2d'), vectorLayer(rect));
          assert('rectangle interior red', pixel(basic, 20, 20)[0] > 245);
          assert('transparent rectangle exterior', pixel(basic, 60, 60)[3] === 0);
          const textSurface = canvas(180, 100);
          const decoratedText = {
            kind: 'text', id: 'styled', x: 18, y: 12, width: 145, height: 72,
            fill: '#171717', stroke: 'none', strokeWidth: 0,
            text: 'hello', fontSize: 34, fontFamily: 'Arial', textTransform: 'uppercase',
            textDecoration: 'underline', textBackground: '#ffe8c1', textPadding: 6,
          };
          engine.renderLayer(textSurface.getContext('2d'), vectorLayer(decoratedText));
          assert('styled text backing is rendered in its own object rectangle', pixel(textSurface, 19, 13)[0] > 240);
          assert('styled text retains transparent pixels outside its bounds', pixel(textSurface, 3, 3)[3] === 0);
          const ordinary = canvas(180, 100);
          engine.renderLayer(ordinary.getContext('2d'), vectorLayer({ ...decoratedText,
            textBackground: 'none', textDecoration: 'none' }));
          const glowing = canvas(180, 100);
          engine.renderLayer(glowing.getContext('2d'), vectorLayer({ ...decoratedText,
            textBackground: 'none', textDecoration: 'none',
            textShadowColor: '#ee0000', textShadowBlur: 11, textShadowX: 9, textShadowY: 7,
          }));
          const alphaSum = surface => surface.getContext('2d').getImageData(0, 0, 180, 100).data
            .filter((_, index) => index % 4 === 3).reduce((a, b) => a + b, 0);
          assert('adjustable text shadow adds pixels outside the original glyph shape', alphaSum(glowing) > alphaSum(ordinary));
          // New parametric shapes must use the same paths in the editor and SVG output.
          for (const kind of ['roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring']) {
            const surface = canvas();
            const shape = { ...rect, kind, x: 10, y: 10, width: 60, height: 50,
              sides: 5, innerRatio: 0.45, cornerRadius: 10 };
            engine.renderLayer(surface.getContext('2d'), vectorLayer(shape));
            const alphaCount = surface.getContext('2d').getImageData(0, 0, 80, 80).data
              .filter((value, index) => index % 4 === 3 && value > 0).length;
            assert(`${kind} has visible, vector-rendered pixels`, alphaCount > 80);
            assert(`${kind} keeps outside transparent`, pixel(surface, 0, 0)[3] === 0);
            if (kind === 'ring') assert('ring center stays hollow', pixel(surface, 40, 35)[3] === 0);
          }

          // Quality regression: live FX previews must not shrink the entire
          // pasted photograph or rasterized vector text before enlarging it.
          const nativeWidth = 1200;
          const nativeHeight = 720;
          const details = canvas(nativeWidth, nativeHeight);
          const detailsContext = details.getContext('2d');
          const checker = detailsContext.createImageData(nativeWidth, nativeHeight);
          for (let index = 0; index < checker.data.length; index += 4) {
            const position = index / 4;
            const x = position % nativeWidth;
            const y = Math.floor(position / nativeWidth);
            const value = (x + y) % 2 === 0 ? 255 : 0;
            checker.data[index] = checker.data[index + 1] = checker.data[index + 2] = value;
            checker.data[index + 3] = 255;
          }
          detailsContext.putImageData(checker, 0, 0);
          const fullQualityEffect = { id: 'full', kind: 'grayscale', amount: 100, enabled: true };
          const layerForPreview = {
            id: 'full-pasted-image', name: 'Pasted photo', visible: true, locked: false,
            x: 0, y: 0, opacity: 1, blend: 'source-over', type: 'raster',
            image: 'data:source-unchanged', effects: [fullQualityEffect],
          };
          let sourcePaints = 0;
          const paintDetailSource = (context) => {
            sourcePaints++;
            context.drawImage(details, 0, 0);
          };
          const normalDetail = canvas(nativeWidth, nativeHeight);
          engine.renderWithEffects(normalDetail.getContext('2d'), layerForPreview,
            paintDetailSource, nativeWidth, nativeHeight);
          engine.setInteractiveEffectPreview(true, layerForPreview.id);
          const draggingDetail = canvas(nativeWidth, nativeHeight);
          engine.renderWithEffects(draggingDetail.getContext('2d'), {
            ...layerForPreview, effects: [{ ...fullQualityEffect, amount: 100 }],
          }, paintDetailSource, nativeWidth, nativeHeight);
          engine.setInteractiveEffectPreview(false);
          const baseline = normalDetail.getContext('2d').getImageData(0, 0, nativeWidth, nativeHeight).data;
          const previewPixels = draggingDetail.getContext('2d').getImageData(0, 0, nativeWidth, nativeHeight).data;
          let changedPixels = 0;
          for (let index = 0; index < baseline.length; index++) {
            if (baseline[index] !== previewPixels[index]) changedPixels++;
          }
          assert('full-resolution pixel detail is identical while adjusting effects', changedPixels === 0);
          assert('preview source is painted only once when effect settings change', sourcePaints === 1);
          const changedSource = canvas(nativeWidth, nativeHeight);
          engine.renderWithEffects(changedSource.getContext('2d'), {
            ...layerForPreview, image: 'data:new-image-content',
          }, paintDetailSource, nativeWidth, nativeHeight);
          assert('modifying pasted image content invalidates the full-resolution source cache', sourcePaints === 2);
          const transformedSource = canvas(nativeWidth, nativeHeight);
          engine.renderWithEffects(transformedSource.getContext('2d'), {
            ...layerForPreview, image: 'data:new-image-content', x: 18,
          }, paintDetailSource, nativeWidth, nativeHeight);
          assert('moving a pasted image invalidates its compositing source', sourcePaints === 3);

          assert('a one-pixel alternating pattern retains independent pixel edges',
            pixel(draggingDetail, 300, 300)[0] === 255 && pixel(draggingDetail, 301, 300)[0] === 0);

          const sharpTextLayer = vectorLayer({
            kind: 'text', id: 'sharp-text', x: 70, y: 70, width: 470, height: 80,
            text: 'SHARP VECTOR TEXT', fontSize: 38, fontFamily: 'Arial',
            fill: '#ffffff', stroke: 'none', strokeWidth: 0,
          });
          sharpTextLayer.id = 'full-text-layer';
          sharpTextLayer.effects = [fullQualityEffect];
          const textNormal = canvas(nativeWidth, nativeHeight);
          engine.renderLayer(textNormal.getContext('2d'), sharpTextLayer);
          engine.setInteractiveEffectPreview(true, sharpTextLayer.id);
          const textDragging = canvas(nativeWidth, nativeHeight);
          engine.renderLayer(textDragging.getContext('2d'), { ...sharpTextLayer,
            effects: [{ ...fullQualityEffect, amount: 100 }] });
          engine.setInteractiveEffectPreview(false);
          const originalText = textNormal.getContext('2d').getImageData(0, 0, nativeWidth, nativeHeight).data;
          const changedText = textDragging.getContext('2d').getImageData(0, 0, nativeWidth, nativeHeight).data;
          let textDifference = 0;
          for (let index = 0; index < originalText.length; index++) {
            if (originalText[index] !== changedText[index]) textDifference++;
          }
          assert('antialiased text pixels remain unchanged during live effect editing', textDifference === 0);
          assert('effect preview resolves at 1:1 even for expensive filters',
            engine.effectPreviewScale(3840, 2160, sharpTextLayer.id, true) === 1);

          const brightSource = canvas(60, 60);
          const fillCtx = brightSource.getContext('2d');
          fillCtx.fillStyle = 'rgb(95,115,140)';
          fillCtx.fillRect(0, 0, 60, 60);
          const lower = engine.processEffects(brightSource, [{ kind: 'brightness', enabled: true, amount: 50 }]);
          const higher = engine.processEffects(brightSource, [{ kind: 'brightness', enabled: true, amount: 190 }]);
          assert('brightness changes pixels during slider preview', pixel(higher, 20, 20)[0] > pixel(lower, 20, 20)[0] + 90);
          const blue = engine.processEffects(brightSource, [{ kind: 'hue', enabled: true, amount: 200 }]);
          const noHue = engine.processEffects(brightSource, [{ kind: 'hue', enabled: true, amount: 1 }]);
          assert('hue angle changes actual RGB channels', pixel(blue, 20, 20).some((v, i) => i < 3 && v !== pixel(noHue, 20, 20)[i]));
          const smallBlur = engine.processEffects(basic, [{ kind: 'blur', enabled: true, amount: 1 }]);
          const largeBlur = engine.processEffects(basic, [{ kind: 'blur', enabled: true, amount: 12 }]);
          assert('blur slider radius changes boundary pixels', pixel(largeBlur, 8, 20)[3] > pixel(smallBlur, 8, 20)[3]);
          const allGray = engine.processEffects(brightSource, [{ kind: 'grayscale', enabled: true, amount: 100 }]);
          const lowGray = engine.processEffects(brightSource, [{ kind: 'grayscale', enabled: true, amount: 20 }]);
          assert('grayscale 20% differs from 100%', pixel(allGray, 15, 15)[0] !== pixel(lowGray, 15, 15)[0]);


          const masks = canvas();
          const masked = vectorLayer({ ...rect, x: 0, y: 0, width: 60, height: 60 });
          masked.mask = { x: 10, y: 10, width: 20, height: 20 };
          engine.renderLayer(masks.getContext('2d'), masked);
          assert('mask retains content inside', pixel(masks, 15, 15)[3] === 255);
          assert('mask removes content outside', pixel(masks, 40, 40)[3] === 0);

          const curves = canvas();
          const path = {
            kind: 'path', id: 'curve', x: 0, y: 0, width: 60, height: 0,
            fill: 'none', stroke: '#0000ff', strokeWidth: 8,
            nodes: [{ x: 10, y: 40, out: { x: 20, y: 40 } }, { x: 60, y: 40, in: { x: 50, y: 40 } }],
          };
          engine.renderLayer(curves.getContext('2d'), vectorLayer(path));
          assert('cubic Bézier stroke visible', pixel(curves, 35, 40)[2] > 200);
          assert('cubic Bézier stroke bounded', pixel(curves, 35, 15)[3] === 0);

          const rotated = canvas();
          const rotatedRect = { ...rect, x: 20, y: 30, width: 40, height: 8, rotation: 90 };
          engine.renderLayer(rotated.getContext('2d'), vectorLayer(rotatedRect));
          assert('rotation covers vertical axis', pixel(rotated, 40, 18)[0] > 200);
          assert('rotation does not cover original horizontal corner', pixel(rotated, 25, 34)[3] === 0);

          const base = canvas();
          const imgctx = base.getContext('2d');
          imgctx.fillStyle = '#0000ff';
          imgctx.fillRect(0, 0, 16, 16);
          const raster = {
            id: 'r', name: 'Raster', visible: true, locked: false,
            opacity: 1, blend: 'source-over', x: 20, y: 10,
            image: base.toDataURL('image/png'), imageWidth: 80, imageHeight: 80,
            type: 'raster', scaleX: 0.5, scaleY: 2,
          };
          await engine.prepareImages({ layers: [raster] });
          const composed = canvas();
          engine.renderLayer(composed.getContext('2d'), raster);
          assert('raster data URL is decoded', pixel(composed, 21, 12)[2] > 200);
          assert('raster scale is applied', pixel(composed, 35, 40)[3] === 0);
          const brushed = canvas();
          const brushCtx = brushed.getContext('2d');
          engine.drawBrushDab(brushCtx, { x: 30, y: 30 }, {
            radius: 14, hardness: 0.2, opacity: 1, color: '#00ff00', erase: false,
          });
          assert('soft brush center is opaque', pixel(brushed, 30, 30)[1] > 200);
          assert('soft brush falloff fades at edge', pixel(brushed, 41, 30)[3] < 200);
          assert('brush does not paint outside radius', pixel(brushed, 60, 30)[3] === 0);
          engine.drawBrushDab(brushCtx, { x: 30, y: 30 }, {
            radius: 6, hardness: 1, opacity: 1, color: '#000000', erase: true,
          });
          assert('eraser removes existing alpha', pixel(brushed, 30, 30)[3] === 0);
          const customLine = canvas();
          const curved = {
            kind: 'line', id: 'line', x: 5, y: 55, width: 70, height: 0,
            controls: [{ x: 5, y: 5 }, { x: 75, y: 5 }],
            fill: 'none', stroke: '#ff00ff', strokeWidth: 5,
          };
          engine.renderLayer(customLine.getContext('2d'), vectorLayer(curved));
          assert('four-point cubic line passes through upper arc', pixel(customLine, 40, 18)[0] > 100);
          assert('four-point cubic line keeps lower region transparent', pixel(customLine, 40, 60)[3] === 0);

          const fxSource = canvas();
          const fxCtx = fxSource.getContext('2d');
          fxCtx.fillStyle = '#642800';
          fxCtx.fillRect(25, 25, 20, 20);
          const brighter = engine.processEffects(fxSource, [
            { id: 'e1', kind: 'brightness', amount: 150, enabled: true },
          ]);
          assert('brightness filter increases red component', pixel(brighter, 30, 30)[0] > pixel(fxSource, 30, 30)[0]);
          assert('FX preserves transparent exterior', pixel(brighter, 5, 5)[3] === 0);
          const outlined = engine.processEffects(fxSource, [
            { id: 'e2', kind: 'outline', amount: 6, color: '#00ff00', enabled: true },
          ]);
          assert('hyper outline extends beyond source silhouette', pixel(outlined, 21, 35)[1] > 100);
          assert('original artwork remains intact after outline', pixel(outlined, 30, 35)[0] > 75);
          const noEffect = engine.processEffects(fxSource, [
            { id: 'e3', kind: 'contrast', amount: 150, enabled: false },
          ]);
          assert('disabled effects bypass processing', noEffect === fxSource);

          const inverted = engine.processEffects(fxSource, [
            { id: 'new-invert', kind: 'invert', amount: 100, enabled: true },
          ]);
          assert('invert filter reverses channels', pixel(inverted, 30, 30)[0] > 100);
          const posterized = engine.processEffects(fxSource, [
            { id: 'new-posterize', kind: 'posterize', amount: 2, enabled: true },
          ]);
          assert('posterize retains source alpha', pixel(posterized, 30, 30)[3] === 255);
          assert('posterize quantizes red channel', pixel(posterized, 30, 30)[0] === 0);
          const pixelatedSource = canvas(32, 32);
          pixelatedSource.getContext('2d').fillStyle = '#ff0000';
          pixelatedSource.getContext('2d').fillRect(0, 0, 8, 8);
          const pixelated = engine.processEffects(pixelatedSource, [
            { id: 'new-pixelate', kind: 'pixelate', amount: 8, enabled: true },
          ]);
          assert('pixelate expands sampled cells', pixel(pixelated, 5, 5)[0] > 0);
          const vignetteSource = canvas(40, 40);
          vignetteSource.getContext('2d').fillStyle = '#ffffff';
          vignetteSource.getContext('2d').fillRect(0, 0, 40, 40);
          const vignette = engine.processEffects(vignetteSource, [
            { id: 'new-vignette', kind: 'vignette', amount: 180, enabled: true },
          ]);
          assert('vignette darkens the corners', pixel(vignette, 0, 0)[0] < pixel(vignette, 20, 20)[0]);
          assert('vignette preserves original source', pixel(vignetteSource, 0, 0)[0] === 255);

          const textLayer = canvas();
          const text = { kind: 'text', id: 'txt', x: 4, y: 4, width: 75, height: 45,
            fill: '#ffffff', stroke: 'none', strokeWidth: 0,
            fontSize: 20, fontWeight: '700', text: 'Hello\nWorld', lineHeight: 1.25 };
          engine.renderLayer(textLayer.getContext('2d'), vectorLayer(text));
          assert('multiline typography draws text pixels',
            textLayer.getContext('2d').getImageData(0, 0, 80, 80).data.some((value, i) => i % 4 === 3 && value > 0));

          // Clipboard ingestion follows the same real browser FileReader and Image decode path as Ctrl+V.
          engine.useEditor.getState().newDoc('Clipboard', 80, 80, 'transparent');
          const red = canvas(12, 10);
          const redContext = red.getContext('2d');
          redContext.fillStyle = '#e63226';
          redContext.fillRect(0, 0, 12, 10);
          const redBlob = await new Promise(resolve => red.toBlob(resolve, 'image/png'));
          const transfer = new DataTransfer();
          transfer.items.add(new File([redBlob], 'copied.png', { type: 'image/png' }));
          const paste = new ClipboardEvent('paste', { clipboardData: transfer });
          assert('pasted image is recognized from clipboard event', await engine.handlePaste(paste));
          const editor = engine.useEditor.getState();
          const pasted = editor.tabs.find(tab => tab.doc.id === editor.activeId).doc;
          assert('clipboard image creates editable raster layer', pasted.layers.at(-1).type === 'raster');
          assert('clipboard layer preserves image dimensions', pasted.layers.at(-1).imageWidth === 12 && pasted.layers.at(-1).imageHeight === 10);
          assert('clipboard paste is undoable', pasted.layers.length === 2);
          editor.undo();
          const undone = engine.useEditor.getState().tabs.find(tab => tab.doc.id === engine.useEditor.getState().activeId).doc;
          assert('undo removes clipboard layer', undone.layers.length === 1);

          const editState = engine.useEditor.getState();
          editState.addShape({
            id: 'copy-vector', kind: 'rect', x: 3, y: 5, width: 20, height: 18,
            fill: '#bb33ee', stroke: 'none', strokeWidth: 0,
          });
          editState.selectShape('copy-vector');
          const copyTransfer = new DataTransfer();
          const copyEvent = new ClipboardEvent('copy', { clipboardData: copyTransfer });
          assert('vector copy stores editable clipboard geometry', await engine.copySelected(copyEvent));
          editState.newDoc('Vector target', 80, 80, '#ffffff');
          const vectorPaste = new ClipboardEvent('paste', { clipboardData: copyTransfer });
          assert('internal Huelith vector format can be pasted', await engine.handlePaste(vectorPaste));
          const pastedVector = engine.useEditor.getState().tabs.find(tab => tab.doc.id === engine.useEditor.getState().activeId).doc;
          assert('pasted vector geometry is editable in new document',
            pastedVector.layers.at(-1).type === 'vector' && pastedVector.layers.at(-1).shapes[0].width === 20);

          const doc = engine.createDocument('Smoke', 80, 80, '#ffffff');
          doc.layers = [vectorLayer(rect)];
          const exported = engine.exportCanvas(doc);
          assert('export uses white document background', pixel(exported, 70, 70)[0] === 255);
          assert('export includes vector layers', pixel(exported, 20, 20)[1] === 0);
          const fxDocument = engine.createDocument('Thumbnail FX', 80, 80, 'transparent');
          const flat = vectorLayer({ ...rect, x: 25, y: 25, width: 20, height: 20 });
          flat.effects = [{ id: 'outline', kind: 'outline', amount: 6,
            color: '#00ff00', enabled: true }];
          fxDocument.layers = [flat];
          const fxExported = engine.exportCanvas(fxDocument);
          assert('PNG pipeline renders non-destructive layer FX', pixel(fxExported, 21, 35)[1] > 100);
          assert('source layer geometry survives FX export', flat.shapes[0].x === 25);

          // The effects library is not just labels: every shipped filter must alter a varied input.
          const palette = canvas(72, 72);
          const paletteCtx = palette.getContext('2d');
          const ramp = paletteCtx.createLinearGradient(0, 0, 72, 72);
          ramp.addColorStop(0, '#f46620');
          ramp.addColorStop(0.4, '#214bad');
          ramp.addColorStop(1, '#aff03a');
          paletteCtx.fillStyle = ramp;
          paletteCtx.fillRect(6, 6, 60, 60);
          paletteCtx.fillStyle = '#070819';
          paletteCtx.fillRect(11, 17, 29, 32);
          paletteCtx.fillStyle = '#eac7ee';
          paletteCtx.fillRect(44, 28, 19, 25);
          const raw = paletteCtx.getImageData(0, 0, 72, 72).data;
          const countDifferences = surface => {
            const output = surface.getContext('2d').getImageData(0, 0, 72, 72).data;
            let count = 0;
            for (let j = 0; j < output.length; j++) if (output[j] !== raw[j]) count++;
            return count;
          };
          assert('FX library includes at least 60 implemented filters', engine.FILTERS.length >= 60);
          for (const item of engine.FILTERS) {
            const input = item.kind === 'cutout' ? (() => {
              const frame = canvas(72, 72);
              const frameCtx = frame.getContext('2d');
              frameCtx.fillStyle = '#ffffff';
              frameCtx.fillRect(0, 0, 72, 72);
              frameCtx.fillStyle = '#d33a52';
              frameCtx.fillRect(20, 20, 25, 29);
              return frame;
            })() : palette;
            const result = engine.processEffects(input, [engine.newEffect(item.kind, item.initial)]);
            const difference = item.kind === 'cutout'
              ? pixel(result, 0, 0)[3] !== pixel(input, 0, 0)[3]
              : countDifferences(result) > 0;
            assert(`${item.label} modifies actual pixels`, difference);
          }
          for (const [name, preset] of Object.entries(engine.FX_PRESETS)) {
            const result = engine.processEffects(palette, preset.map(item => engine.newEffect(
              item.kind, item.amount, item.color, item.parameters)));
            assert(`Signature FX ${name} produces a visible composition`, countDifferences(result) > 0);
          }
          // Stage D–H acceptance: semantics, shape-dependent illumination, and independent FX.
          const signatureOutputs = new Set();
          for (const [name, recipe] of Object.entries(engine.FX_PRESETS)) {
            assert(`${name} is one native signature FX rather than a reused-filter recipe`,
              recipe.length === 1 && recipe[0].kind.startsWith('sig_'));
            const result = engine.processEffects(palette, [engine.newEffect(
              recipe[0].kind, recipe[0].amount, recipe[0].color, recipe[0].parameters)]);
            signatureOutputs.add(result.toDataURL('image/png'));
          }
          assert('all 22 signature FX have visually distinguishable output', signatureOutputs.size === 22);
          const warm = engine.processEffects(brightSource, [engine.newEffect('exposure', 100)]);
          const dimmed = engine.processEffects(brightSource, [engine.newEffect('exposure', -100)]);
          assert('Exposure -1 EV and +1 EV are distinct tonal operations', pixel(warm, 5, 5)[0] > pixel(dimmed, 5, 5)[0]);
          const brightNeutral = engine.processEffects(brightSource, [engine.newEffect('brightness', 100)]);
          assert('Exposure is not simply additive Brightness', pixel(warm, 5, 5)[0] !== pixel(brightNeutral, 5, 5)[0]);
          const isolate = canvas(40, 15);
          const isolateContext = isolate.getContext('2d');
          isolateContext.fillStyle = '#ff2828'; isolateContext.fillRect(0, 0, 20, 15);
          isolateContext.fillStyle = '#283cff'; isolateContext.fillRect(20, 0, 20, 15);
          const selective = engine.processEffects(isolate, [engine.newEffect('selective', 100, undefined,
            { targetHue: 0, hueWidth: 48, hueShift: 0, saturationAdjust: 0 })]);
          const chosen = pixel(selective, 6, 7), other = pixel(selective, 32, 7);
          assert('Selective Color preserves the chosen red', chosen[0] > chosen[1] + 100);
          assert('Selective Color desaturates unselected blue', Math.max(...other.slice(0, 3)) - Math.min(...other.slice(0, 3)) < 12);
          const aSketch = engine.processEffects(palette, [engine.newEffect('sketch', 75)]);
          const aInk = engine.processEffects(palette, [engine.newEffect('ink', 75)]);
          const aComic = engine.processEffects(palette, [engine.newEffect('comicink', 75)]);
          const aCartoon = engine.processEffects(palette, [engine.newEffect('cartoon', 75)]);
          assert('Pencil / Ink / Comic Ink / Cartoon have four different renderers',
            new Set([aSketch, aInk, aComic, aCartoon].map(c => c.toDataURL())).size === 4);
          const shock = engine.processEffects(palette, [engine.newEffect('zoomblur', 42)]);
          const rotate = engine.processEffects(palette, [engine.newEffect('radialblur', 42)]);
          assert('Shock Zoom lens deformation differs from Radial Blur rotation', shock.toDataURL() !== rotate.toDataURL());
          const box = engine.processEffects(palette, [engine.newEffect('boxblur', 8)]);
          const gaussian = engine.processEffects(palette, [engine.newEffect('blur', 8)]);
          assert('Box Blur kernel differs from Gaussian Blur kernel', box.toDataURL() !== gaussian.toDataURL());
          const holy = engine.processEffects(palette, [engine.newEffect('radiance', 75)]);
          const darkCloud = engine.processEffects(palette, [engine.newEffect('miasma', 75)]);
          assert('Holy Radiance creates a different field than Miasma darkness', holy.toDataURL() !== darkCloud.toDataURL());
          const gradientGlow = engine.newEffect('glow', 26, '#ffffff', {
            glowPalette: 'spectrum', glowMode: 'outer', opacity: 100, softness: 12,
            stops: [
              {id: 'one', position: 0, color: '#ff0000', opacity: 1},
              {id: 'two', position: 0.5, color: '#00ff00', opacity: 1},
              {id: 'three', position: 1, color: '#0000ff', opacity: 1},
            ],
          });
          const rainbow = engine.processEffects(palette, [gradientGlow]);
          const singleGlow = engine.processEffects(palette, [engine.newEffect('glow', 26, '#ff0000',
            {glowPalette: 'single', glowMode: 'outer', opacity: 100, softness: 12})]);
          assert('Spectrum Glow multi-stop palette differs from monochrome glow', rainbow.toDataURL() !== singleGlow.toDataURL());
          const project = engine.createDocument('Signature FX saves');
          project.layers[0].effects = [engine.newEffect('sig_12'), engine.newEffect('radiance'), gradientGlow];
          assert('Signature FX, Holy Radiance and spectral glow survive .huelith validation',
            engine.isDocument(JSON.parse(JSON.stringify(project))));

          // Multi-stop gradient map: low/middle/high luminance must follow independently chosen stops.
          const grayRamp = canvas(3, 1);
          const grayCtx = grayRamp.getContext('2d');
          for (let x = 0; x < 3; x++) {
            const value = x * 127;
            grayCtx.fillStyle = `rgb(${value},${value},${value})`;
            grayCtx.fillRect(x, 0, 1, 1);
          }
          const rampEffect = engine.newEffect('gradientmap', 100, undefined, { stops: [
            { id: 'a', position: 0, color: '#ff0000', opacity: 1 },
            { id: 'b', position: 0.5, color: '#00ff00', opacity: 1 },
            { id: 'c', position: 1, color: '#0000ff', opacity: 1 },
          ] });
          const mapped = engine.processEffects(grayRamp, [rampEffect]);
          assert('Gradient Map paints darkest stop red', pixel(mapped, 0, 0)[0] > 240);
          assert('Gradient Map paints midtone stop green', pixel(mapped, 1, 0)[1] > 235);
          assert('Gradient Map paints highlight stop blue', pixel(mapped, 2, 0)[2] > 240);
          const gradientAlphaSurface = canvas(10, 10);
          gradientAlphaSurface.getContext('2d').fillStyle = '#777777';
          gradientAlphaSurface.getContext('2d').fillRect(3, 3, 4, 4);
          const isolatedMapped = engine.processEffects(gradientAlphaSurface, [rampEffect]);
          assert('Gradient Map preserves transparent pixels', pixel(isolatedMapped, 0, 0)[3] === 0);
          const originalCurve = engine.newEffect('curves');
          const elevatedCurve = engine.newEffect('curves', 100, undefined, { curvePoints: [
            { x: 0, y: 0 }, { x: 0.5, y: 0.9 }, { x: 1, y: 1 },
          ] });
          const curveA = engine.processEffects(brightSource, [originalCurve]);
          const curveB = engine.processEffects(brightSource, [elevatedCurve]);
          assert('Curve nodes edit actual channel luminance', pixel(curveA, 15, 15)[0] !== pixel(curveB, 15, 15)[0]);
          const balanceA = engine.processEffects(brightSource, [engine.newEffect('balance', 100, undefined, { highlightsRed: 35 })]);
          const balanceB = engine.processEffects(brightSource, [engine.newEffect('balance', 100, undefined, { highlightsRed: -35 })]);
          assert('Color balance has independently editable tonal channels', pixel(balanceA, 15, 15)[0] !== pixel(balanceB, 15, 15)[0]);
          const shadowSource = canvas(90, 90);
          shadowSource.getContext('2d').fillStyle = '#ffffff';
          shadowSource.getContext('2d').fillRect(40, 40, 10, 10);
          const shadowEffect = engine.newEffect('shadow', 30, undefined, { shadows: [
            { id:'r',enabled:true,offsetX:-15,offsetY:0,radius:0,spread:0,opacity:1,color:'#ff0000' },
            { id:'b',enabled:true,offsetX:15,offsetY:0,radius:0,spread:0,opacity:1,color:'#0000ff' },
          ] });
          const layeredShadow = engine.processEffects(shadowSource, [shadowEffect]);
          assert('Shadow stack supports red and blue at separate offsets',
            pixel(layeredShadow, 30, 43)[0] > 230 && pixel(layeredShadow, 60, 43)[2] > 230);
          const painting = engine.processEffects(palette, [engine.newEffect('oilpaint', 65)]);
          assert('Oil Paint uses brush marks, not just palette reduction', countDifferences(painting) > 200);
          const watercolor = engine.processEffects(palette, [engine.newEffect('watercolor', 65)]);
          assert('Watercolor uses a distinct painterly processor', countDifferences(watercolor) > 200);
          // Diagnostic sweep: each visible scalar control must cause a render change.
          const parametersWithNoVisualChange = [];
          const diagnosticInput = canvas(40, 40);
          const diagnosticCtx = diagnosticInput.getContext('2d');
          const diagnosticGrad = diagnosticCtx.createLinearGradient(0, 0, 40, 40);
          diagnosticGrad.addColorStop(0, '#e45338');
          diagnosticGrad.addColorStop(0.5, '#265bdb');
          diagnosticGrad.addColorStop(1, '#a9e451');
          diagnosticCtx.fillStyle = diagnosticGrad;
          diagnosticCtx.fillRect(7, 7, 26, 26);
          diagnosticCtx.fillStyle = '#f5e0a3';
          diagnosticCtx.fillRect(15, 17, 9, 10);
          function differentImages(one, two) {
            const a = one.getContext('2d').getImageData(0, 0, one.width, one.height).data;
            const b = two.getContext('2d').getImageData(0, 0, two.width, two.height).data;
            return a.some((value, index) => value !== b[index]);
          }
          for (const { kind, initial } of engine.FILTERS) {
            for (const control of (engine.EFFECT_PARAMETERS[kind] ?? [])) {
              if (control.min === control.max) continue;
              // Background tolerance only applies to fully opaque, flat-backed images.
              // This diagnostic source is intentionally transparent.
              if ((kind === 'sig_0' || kind === 'outline') && control.key === 'silhouetteTolerance') continue;
              let lowValue = control.min + (control.max - control.min) * 0.25;
              let highValue = control.min + (control.max - control.min) * 0.75;
              if (['offsetX', 'offsetY', 'shiftY'].includes(control.key)) { lowValue = -5; highValue = 5; }
              if (['softness', 'blur', 'spread', 'radius', 'radiusY', 'scale'].includes(control.key)) {
                lowValue = control.min; highValue = Math.min(control.max, 8);
              }
              if (control.key === 'angle') { lowValue = 0; highValue = 60; }
              if (control.key === 'grainSize') { lowValue = 1; highValue = 6; }
              if (control.key === 'gap') { lowValue = 0; highValue = 2; }
              // These are PIXEL distances or offsets, not global percentages.
              // Values outside this 40px fixture could have no visible output.
              if (kind === 'outline' && control.key === 'outlineGap') { lowValue = 1; highValue = 5; }
              if (kind === 'outline' && control.key === 'secondaryWidth') { lowValue = 2; highValue = 8; }
              if (kind === 'miasma' && ['windX','windY'].includes(control.key)) { lowValue = -7; highValue = 7; }
              if (control.key === 'scale') { lowValue = 25; highValue = 180; }
              const checkAmount = kind === 'outline' ? 2 : initial;
              const conditional = kind === 'glow' && control.key === 'threshold' ? { glowMode: 'bloom' }
                : kind === 'backdrop' && control.key === 'angle' ? { backdropMode: 'gradient' }
                : kind === 'outline' && control.key === 'edgeSensitivity' ? { silhouetteMode: 'edge' } : {};
              const low = engine.newEffect(kind, checkAmount, undefined, { ...conditional, [control.key]: lowValue });
              const high = engine.newEffect(kind, checkAmount, undefined, { ...conditional, [control.key]: highValue });
              const one = engine.processEffects(diagnosticInput, [low]);
              const two = engine.processEffects(diagnosticInput, [high]);
              if (!differentImages(one, two)) parametersWithNoVisualChange.push(`${kind}.${control.key}`);
            }
          }
          assert('Every exposed scalar parameter changes the rendered image: ' + parametersWithNoVisualChange.join(', '), parametersWithNoVisualChange.length === 0);
          // Studio Experience: validate spatially distinct light, shadows and backdrops.
          const lightingSource = canvas(72, 72);
          const lc = lightingSource.getContext('2d');
          lc.fillStyle = '#e1a667';
          lc.fillRect(24, 23, 24, 27);
          lc.fillStyle = '#ffffff';
          lc.fillRect(31, 29, 10, 12);
          const outerGlow = engine.processEffects(lightingSource, [engine.newEffect('glow', 16, '#c22eff',
            { glowMode: 'outer', softness: 17, spread: 1, opacity: 100 })]);
          const innerGlow = engine.processEffects(lightingSource, [engine.newEffect('glow', 16, '#c22eff',
            { glowMode: 'inner', softness: 17, spread: 1, opacity: 100 })]);
          assert('outer glow illuminates outside silhouette', pixel(outerGlow, 20, 36)[3] > 0);
          assert('inner glow leaves exterior transparent', pixel(innerGlow, 20, 36)[3] === 0);
          assert('inner glow changes edge interior', differentImages(innerGlow, lightingSource));
          const bloom = engine.processEffects(lightingSource, [engine.newEffect('glow', 20, '#ffffff',
            { glowMode: 'bloom', softness: 16, threshold: 110, opacity: 100 })]);
          assert('bloom renders highlights beyond source boundaries', pixel(bloom, 20, 36)[3] > 0);
          const gradientBackdrop = engine.processEffects(lightingSource, [engine.newEffect('backdrop', 100, '#333333', {
            backdropMode: 'gradient', opacity: 100, offsetX: 0, offsetY: 0, scale: 100, angle: 0,
            stops: [{ id: 'a', color: '#ff0000', opacity: 1, position: 0 },
              { id: 'b', color: '#0000ff', opacity: 1, position: 1 }],
          })]);
          assert('backdrop gradient paints behind transparent content', pixel(gradientBackdrop, 4, 36)[3] > 0);
          assert('backdrop gradient has independently editable color stops',
            pixel(gradientBackdrop, 5, 36)[0] > pixel(gradientBackdrop, 66, 36)[0]);
          const drop = engine.processEffects(lightingSource, [engine.newEffect('shadow', 30, '#000000', {
            shadows: [{ id: 'd', enabled: true, style: 'drop', color: '#330055', offsetX: 7,
              offsetY: 8, radius: 5, spread: 0, opacity: 1 }],
          })]);
          const innerShadow = engine.processEffects(lightingSource, [engine.newEffect('shadow', 30, '#000000', {
            shadows: [{ id: 'i', enabled: true, style: 'inner', color: '#330055', offsetX: 7,
              offsetY: 8, radius: 5, spread: 0, opacity: 1 }],
          })]);
          assert('drop shadow produces exterior pixels', pixel(drop, 51, 52)[3] > 0);
          assert('inner shadow remains inside silhouette', pixel(innerShadow, 51, 52)[3] === 0);
          assert('inner shadow changes original interior', differentImages(lightingSource, innerShadow));
          const alpha = canvas(90, 90);
          const alphaCtx = alpha.getContext('2d');
          alphaCtx.fillStyle = '#e14727';
          alphaCtx.fillRect(34, 30, 22, 28);
          const thin = engine.processEffects(alpha, [engine.newEffect('outline', 3, '#22ff44', { outlineStyle:'classic', softness:0 })]);
          const thick = engine.processEffects(alpha, [engine.newEffect('outline', 12, '#22ff44', { outlineStyle:'classic', softness:0 })]);
          assert('Hyper Outline thickness expands its visible silhouette', pixel(thin, 25, 45)[3] === 0 && pixel(thick, 25, 45)[1] > 120);
          const whitePhoto = canvas(70, 70);
          const whiteCtx = whitePhoto.getContext('2d');
          whiteCtx.fillStyle = '#ffffff';
          whiteCtx.fillRect(0, 0, 70, 70);
          whiteCtx.fillStyle = '#b83748';
          whiteCtx.fillRect(21, 23, 29, 27);
          const isolated = engine.processEffects(whitePhoto, [engine.newEffect('cutout', 30)]);
          assert('Cutout removes connected corner background', pixel(isolated, 0, 0)[3] === 0);
          assert('Cutout preserves interior subject', pixel(isolated, 32, 33)[3] === 255);
          const framed = engine.processEffects(whitePhoto, [engine.newEffect('cutout', 30), engine.newEffect('outline', 6, '#00ed55')]);
          assert('Outline follows extracted subject, not original white rectangle', pixel(framed, 16, 32)[1] > 100 && pixel(framed, 0, 0)[3] === 0);
          for (const kind of ['outline', 'glow', 'shadow', 'backdrop', 'chromatic', 'glitch', 'burst', 'aurora']) {
            const first = engine.newEffect(kind, 0, '#ec45bb');
            const second = engine.newEffect(kind, 70, '#ec45bb');
            const source = kind === 'shadow' || kind === 'outline' || kind === 'glow' ? alpha : palette;
            const low = engine.processEffects(source, [first]);
            const high = engine.processEffects(source, [second]);
            const left = low.getContext('2d').getImageData(0, 0, 72, 72).data;
            const right = high.getContext('2d').getImageData(0, 0, 72, 72).data;
            assert(`${kind} main amount controls visible pixels`, left.some((channel, index) => channel !== right[index]));
          }
          const backdropA = engine.newEffect('backdrop', 90, '#ff44aa', { offsetX: -32, offsetY: 0 });
          const backdropB = engine.newEffect('backdrop', 90, '#ff44aa', { offsetX: 32, offsetY: 0 });
          const backdropLeft = engine.processEffects(alpha, [backdropA]);
          const backdropRight = engine.processEffects(alpha, [backdropB]);
          assert('Backdrop X is a real, live geometry parameter', pixel(backdropLeft, 2, 20)[0] !== pixel(backdropRight, 2, 20)[0]);
          const glowA = engine.processEffects(alpha, [engine.newEffect('glow', 20, '#44ff88', { softness: 2, spread: 0 })]);
          const glowB = engine.processEffects(alpha, [engine.newEffect('glow', 20, '#44ff88', { softness: 48, spread: 0 })]);
          assert('Spectrum Glow falloff is independently adjustable', pixel(glowA, 22, 45)[3] !== pixel(glowB, 22, 45)[3]);
          const curveSamples = engine.strokeSamples({x: 2, y: 5}, {x: 8, y: 5}, {x: 24, y: 23}, 1);
          assert('Smooth brush interpolation ends precisely at pointer coordinates', curveSamples.at(-1).x === 24 && curveSamples.at(-1).y === 23);
          assert('Smooth brush interpolation emits intermediate curve geometry', curveSamples.length > 10 && curveSamples.some(sample => sample.x > 8 && sample.x < 24));

          // Stage I/J: opaque photographs, colorization, and monotonic controls.
          const whiteBackdrop = canvas(96, 64);
          const solid = whiteBackdrop.getContext('2d');
          solid.fillStyle = '#f4f4f4'; solid.fillRect(0, 0, 96, 64);
          solid.fillStyle = '#242b36'; solid.fillRect(28, 18, 40, 29);
          const subjectEffect = engine.newEffect('sig_0', 95, '#ff2738', {
            silhouetteMode: 'auto', silhouetteTolerance: 30, radius: 9,
            opacity: 100, softness: 3,
          });
          const opaqueOutlined = engine.processEffects(whiteBackdrop, [subjectEffect]);
          assert('Hyper Outline reveals subject edges on an opaque flat-backed layer',
            pixel(opaqueOutlined, 24, 31)[0] > pixel(whiteBackdrop, 24, 31)[0] &&
            pixel(opaqueOutlined, 24, 31)[1] < pixel(whiteBackdrop, 24, 31)[1]);
          assert('Hyper Outline preserves source subject pixels',
            pixel(opaqueOutlined, 48, 31).slice(0,3).every((v,i) => v === pixel(whiteBackdrop, 48, 31)[i]));
          const noisyBackdrop = canvas(96, 64);
          const noisyContext = noisyBackdrop.getContext('2d');
          noisyContext.fillStyle = '#242326'; noisyContext.fillRect(0, 0, 96, 64);
          for (let y=2; y < 64; y+=4) for (let x=2; x < 96; x+=5) {
            noisyContext.fillStyle = (x+y)%3 ? '#3c4b66' : '#9c84ad';
            noisyContext.fillRect(x,y,3,2);
          }
          noisyContext.fillStyle = '#f5ebe1'; noisyContext.fillRect(24, 11, 43, 47);
          const edgeOnly = engine.processEffects(noisyBackdrop, [engine.newEffect('sig_0', 100, '#ff2266', {
            silhouetteMode: 'edge', radius: 8, opacity:100,
          })]);
          assert('Hyper Outline edge mode does not silently outline the full opaque rectangle',
            differentImages(edgeOnly, noisyBackdrop));
          const vhsWarm = engine.processEffects(palette, [engine.newEffect('vhs', 75, undefined, {
            colorA: '#ff2525', colorB: '#ffc73d', colorMix:100, density:100,
          })]);
          const vhsCool = engine.processEffects(palette, [engine.newEffect('vhs', 75, undefined, {
            colorA: '#14ebff', colorB: '#2222ec', colorMix:100, density:100,
          })]);
          assert('VHS color pairs alter the actual rendered pixels', differentImages(vhsWarm, vhsCool));
          for (const kind of ['chromatic','glitch','sig_4','sig_8','sig_13']) {
            const first = engine.processEffects(palette,[engine.newEffect(kind,78,undefined,{
              colorA:'#ff302a',colorB:'#fccc38',colorMix:100,density:100,
            })]);
            const second = engine.processEffects(palette,[engine.newEffect(kind,78,undefined,{
              colorA:'#28e1fa',colorB:'#2736fa',colorMix:100,density:100,
            })]);
            assert(`${kind} honors independently selected distortion colors`,differentImages(first,second));
          }
          const neonLow = engine.processEffects(alpha,[engine.newEffect('sig_1',60,'#a824f6',{
            radius:12,frequency:0,opacity:100,
          })]);
          const neonHigh = engine.processEffects(alpha,[engine.newEffect('sig_1',60,'#a824f6',{
            radius:12,frequency:100,opacity:100,
          })]);
          assert('Neon intensity at max differs from min rather than looping',differentImages(neonLow,neonHigh));
          return results;
        }''')
        # Execute the same effect-core bundle inside a real OffscreenCanvas Worker.
        # Compare its pixels against the deterministic main-thread processor.
        worker_checks = page.evaluate(r'''async () => {
          if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
            throw new Error('OffscreenCanvas worker is required for Stage I acceptance');
          }
          const sources = window.HuelithBundledModules;
          const workerSource = `
            const sources = ${JSON.stringify(sources)};
            const modules = {};
            function load(name) {
              if (modules[name]) return modules[name];
              const mod = {exports:{}};
              new Function('require','module','exports',sources[name])(
                path => load(path.replace('./','')),mod,mod.exports);
              modules[name] = mod.exports;
              return mod.exports;
            }
            self.onmessage = event => {
              const source = new OffscreenCanvas(90,60);
              const ctx = source.getContext('2d');
              ctx.fillStyle = '#fafafa'; ctx.fillRect(0,0,90,60);
              ctx.fillStyle = '#212839'; ctx.fillRect(20,10,46,35);
              const result = load('fx').processEffects(source,[event.data.effect]);
              const bytes = result.getContext('2d').getImageData(0,0,90,60).data;
              self.postMessage(Array.from(bytes));
            };
          `;
          const url = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
          const worker = new Worker(url);
          try {
            const effect = window.HuelithTest.newEffect('sig_0', 85, '#ff3344', {
              silhouetteMode:'auto',radius:10,softness:4,silhouetteTolerance:35,
            });
            const testImage = document.createElement('canvas');
            testImage.width=90; testImage.height=60;
            const ctx=testImage.getContext('2d');
            ctx.fillStyle='#fafafa';ctx.fillRect(0,0,90,60);
            ctx.fillStyle='#212839';ctx.fillRect(20,10,46,35);
            const main = window.HuelithTest.processEffects(testImage,[effect]);
            const original = main.getContext('2d').getImageData(0,0,90,60).data;
            const expected=Array.from(original);
            const actual = await Promise.race([
              new Promise((resolve,reject)=>{
                worker.onmessage=event=>resolve(event.data);
                worker.onerror=event=>reject(new Error(event.message));
                worker.postMessage({effect});
              }),
              new Promise((_,reject)=>setTimeout(()=>reject(Error('Effect worker stalled')),12000)),
            ]);
            if (!actual.every((value,index)=>value===expected[index])) {
              throw new Error('Worker output differs from synchronous export rendering');
            }
            return ['OffscreenCanvas FX worker executes actual source processors',
              'Worker outline pixels agree with synchronous export pixels'];
          } finally { worker.terminate(); URL.revokeObjectURL(url); }
        }''')
        checks.extend(worker_checks)
        # Run the actual cached-source worker, not a simplified hand-written mock.
        # This catches stale source buffers, neutral-effect buffer detachment and
        # worker vs export divergence when a slider sends parameter-only updates.
        cached_worker_checks = page.evaluate(r'''async () => {
          const bundled = window.HuelithBundledModules;
          const program = `
            const compiled = ${JSON.stringify(bundled)};
            const modules = {};
            function load(name) {
              if (modules[name]) return modules[name];
              const module = {exports:{}};
              modules[name] = module.exports;
              new Function('require','module','exports',compiled[name])(
                spec => load(spec.replace('./','')), module, module.exports);
              modules[name] = module.exports;
              return module.exports;
            }
            load('effects-worker');
          `;
          const url = URL.createObjectURL(new Blob([program], {type: 'text/javascript'}));
          const worker = new Worker(url);
          try {
            const source = document.createElement('canvas');
            source.width = 96;
            source.height = 64;
            const painter = source.getContext('2d');
            painter.fillStyle = '#16213d';
            painter.fillRect(0,0,96,64);
            painter.fillStyle = '#f77a34';
            painter.fillRect(20,12,50,36);
            painter.fillStyle = '#47dbea';
            painter.fillRect(30,20,15,18);
            const pixelData = image => {
              const canvas = document.createElement('canvas');
              canvas.width=96; canvas.height=64;
              canvas.getContext('2d').drawImage(image,0,0);
              return [...canvas.getContext('2d').getImageData(0,0,96,64).data];
            };
            async function render(id, effect, sendBitmap) {
              const bitmap = sendBitmap ? await createImageBitmap(source) : undefined;
              const stack = Array.isArray(effect) ? effect : [effect];
              const message = {id, sourceId: 100, effects: stack};
              if (bitmap) message.bitmap=bitmap;
              const result = await Promise.race([
                new Promise((resolve,reject) => {
                  worker.onmessage = event => resolve(event.data);
                  worker.onerror = event => reject(new Error(event.message));
                  worker.postMessage(message, bitmap ? [bitmap] : []);
                }),
                new Promise((_,reject) => setTimeout(() => reject(Error('Live worker timed out')),12000)),
              ]);
              if (result.error) throw Error(result.error);
              const data=pixelData(result.result);
              result.result.close();
              const expected = pixelData(window.HuelithTest.processEffects(source,stack));
              if (!data.every((value,index) => value===expected[index])) {
                throw Error(`Slider preview/export pixel mismatch at request ${id}`);
              }
              return data;
            }
            const first=await render(1,window.HuelithTest.newEffect('brightness',130),true);
            const second=await render(2,window.HuelithTest.newEffect('brightness',170),false);
            if (first.every((value,index)=>value===second[index])) throw Error('Changed slider amount produced identical preview');
            const neutral={...window.HuelithTest.newEffect('brightness',100),enabled:false};
            const unchanged=await render(3,neutral,false);
            if (!unchanged.every((value,index)=>value===pixelData(source)[index])) throw Error('Neutral processor damaged source');
            const restored=await render(4,window.HuelithTest.newEffect('brightness',130),false);
            if (!restored.every((value,index)=>value===first[index])) throw Error('Cached source changed after neutral processor');
            // A two-effect stack catches reusing an intermediate whose backing
            // OffscreenCanvas was accidentally detached by transferToImageBitmap.
            const initial = window.HuelithTest.newEffect('grayscale',73);
            const adjustment = window.HuelithTest.newEffect('brightness',125);
            await render(5,[initial,adjustment],false);
            await render(6,[initial,{...adjustment,amount:186}],false);
            await render(7,[initial,{...adjustment,amount:186}],false);
            return [
              'Full-resolution effect source sent only once across slider changes',
              'Changed slider values render matching export pixels',
              "Neutral effects do not detach the worker's cached source",
              'Later slider changes reuse original pixels without degradation',
              'Changing the second filter reuses the cached first stage without corrupting its pixels',
              'Repeating an identical stacked preview preserves the exact export result',
            ];
          } finally {worker.terminate();URL.revokeObjectURL(url);}
        }''')
        checks.extend(cached_worker_checks)
        # Single-color filters have an instant, native-resolution Canvas2D
        # path. It must match the ordinary (export) processor pixel-for-pixel.
        instant_checks = page.evaluate(r'''() => {
          const { newEffect, processEffects, renderWithEffects, realtimeFilter } = window.HuelithTest;
          const fast = ['brightness','contrast','saturate','hue','grayscale','sepia','invert'];
          const source = document.createElement('canvas');
          source.width = 112; source.height = 76;
          const painter = source.getContext('2d');
          painter.fillStyle = '#db6725'; painter.fillRect(0,0,112,76);
          painter.fillStyle = '#276dc1'; painter.fillRect(11,12,71,45);
          painter.fillStyle = '#aff426'; painter.fillRect(36,22,19,17);
          const pixels = canvas => [...canvas.getContext('2d').getImageData(0,0,112,76).data];
          let validated = 0;
          for (const kind of fast) {
            const controls = {brightness:153,contrast:125,saturate:170,hue:70,grayscale:64,sepia:72,invert:65};
            const effect = newEffect(kind,controls[kind]);
            if (!realtimeFilter([effect])) throw Error('Missing native path for ' + kind);
            const layer = {id: 'native-test-'+kind, type:'raster', image:'test', x:0,y:0, effects:[effect]};
            const preview = document.createElement('canvas');
            preview.width=112;preview.height=76;
            renderWithEffects(preview.getContext('2d'),layer,context=>context.drawImage(source,0,0),112,76,()=>{});
            const expected = pixels(processEffects(source,[effect]));
            const actual = pixels(preview);
            if (!expected.every((v,i)=>v===actual[i])) throw Error(kind+' instant preview/export differ');
            validated++;
          }
          if (realtimeFilter([newEffect('blur',12)])) throw Error('Heavy blur incorrectly ran on UI thread');
          if (realtimeFilter([newEffect('brightness',121),newEffect('contrast',133)])) throw Error('Multi-filter stacks must remain on worker');
          return [validated+' compositor color filters match full-resolution export',
            'Heavy and multi-filter stacks remain isolated from the UI thread'];
        }''')
        checks.extend(instant_checks)
        # Load the *actual* Huelith stylesheets into Chromium and compare computed
        # visual properties, rather than trusting that theme names merely exist.
        project = Path(__file__).resolve().parents[1]
        styles = '\n'.join((project / 'src' / 'styles' / name).read_text()
                           for name in ('app.css', 'glass.css', 'material.css', 'classic.css', 'midnight.css', 'studio.css',
                                        'strawberry.css', 'melon.css', 'peach.css', 'lemon.css', 'mango.css',
                                        'sakura.css', 'blossom.css', 'shadow.css', 'polish.css', 'typography.css', 'workspace-pro.css'))
        page.set_content(f'<style>{styles}</style><div class="app theme-glass">'
                         '<header class="titlebar"><div class="titlebar-drag-space"></div>'
                         '<div class="huelith-window-controls"><button>−</button></div></header>'
                         '<div class="contextbar"><div class="font-picker-trigger"></div></div>'
                         '<div class="toolrail"></div><div class="canvas-host"></div></div>')
        appearances = {}
        for name in ('glass', 'material', 'classic', 'midnight', 'studio'):
            page.locator('.app').evaluate('(element, name) => {element.className = `app theme-${name}`}', name)
            appearances[name] = page.evaluate('''() => {
                const rail = getComputedStyle(document.querySelector('.toolrail'));
                const canvas = getComputedStyle(document.querySelector('.canvas-host'));
                return {
                    railRadius: rail.borderTopRightRadius,
                    railBlur: rail.backdropFilter,
                    canvasBackground: canvas.backgroundImage,
                    background: getComputedStyle(document.querySelector('.app')).backgroundColor,
                };
            }''')
        theme_checks = [
            ('glass panes have real backdrop blur', appearances['glass']['railBlur'] != 'none'),
            ('material has expressive curved rail', appearances['material']['railRadius'] == '19px'),
            ('classic does not inherit material rounding', appearances['classic']['railRadius'] != '19px'),
            ('all five themes have unique canvas backgrounds', len({v['canvasBackground'] for v in appearances.values()}) == 5),
            ('midnight remains low-glare without blur', appearances['midnight']['railBlur'] == 'none'),
            ('studio is light without glass blur', appearances['studio']['railBlur'] == 'none'),
        ]
        for name, success in theme_checks:
            if not success:
                raise AssertionError(f'Computed theme regression: {name}: {appearances}')
            checks.append(name)
        fruit_themes = ('strawberry', 'melon', 'peach', 'lemon', 'mango', 'sakura', 'blossom', 'shadow')
        backgrounds = set()
        rounded = set()
        for mood in fruit_themes:
            page.locator('.app').evaluate('(element, name) => {element.className = `app theme-${name} tone-light`}', mood)
            values = page.evaluate('''() => {
                const app = getComputedStyle(document.querySelector('.app'));
                const canvas = getComputedStyle(document.querySelector('.canvas-host'));
                return {
                    accent: app.getPropertyValue('--accent').trim(),
                    background: app.getPropertyValue('--app-bg').trim(),
                    canvasTexture: canvas.backgroundImage,
                };
            }''')
            backgrounds.add(values['background'])
            rounded.add(values['canvasTexture'])
            page.locator('.app').evaluate('(element, name) => {element.className = `app theme-${name} tone-dark`}', mood)
            dark = page.evaluate('''() => getComputedStyle(document.querySelector('.app')).getPropertyValue('--app-bg').trim()''')
            if not dark or dark == values['background']:
                raise AssertionError(f'{mood} light/dark palette regression')
            checks.append(f'{mood} has distinct light/dark surfaces')
        if len(backgrounds) != len(fruit_themes):
            raise AssertionError('Fruit themes must not share the same base background')
        checks.append('eight additional themes have unique base backgrounds')
        if len(rounded) < 5:
            raise AssertionError('Fruit themes must have distinctive canvas treatments')
        checks.append('fruit themes have differentiated canvas treatments')
        page.locator('.app').evaluate('(element) => {element.className = `app theme-glass`;}')
        pseudo = page.evaluate('''() => getComputedStyle(document.querySelector('.canvas-host'), '::before').display''')
        if pseudo != 'none':
            raise AssertionError(f'Workspace grid overlay must not draw vertical lines: {pseudo}')
        checks.append('Canvas background has no unwanted vertical guide overlay')

        compact = page.evaluate('''() => {
          const css = selector => getComputedStyle(document.querySelector(selector));
          return {
            titlebar: css('.titlebar').height,
            contextbar: css('.contextbar').height,
            rail: css('.toolrail').width,
            windowButton: css('.huelith-window-controls button').width,
            fontTrigger: css('.font-picker-trigger').height,
          };
        }''')
        for title, result in [
            ('compact native titlebar remains 32px high', compact['titlebar'] == '32px'),
            ('compact contextual toolbar remains 31px high', compact['contextbar'] == '31px'),
            ('compact toolrail remains 35px wide', compact['rail'] == '35px'),
            ('desktop caption buttons have appropriate width', compact['windowButton'] == '39px'),
            ('font dropdown fits the 25px typography rail', compact['fontTrigger'] == '25px'),
        ]:
            if not result:
                raise AssertionError(f'Compact typography CSS regression: {title}: {compact}')
            checks.append(title)

        for index, name in enumerate(checks, start=1):
            print(f'PASS {index:02d}: {name}')
        print(f'Chromium canvas/theme integration assertions: {len(checks)} passed')
    finally:
        browser.close()

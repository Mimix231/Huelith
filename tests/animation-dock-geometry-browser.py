"""Offline CSS geometry regression; not a full React/Tauri acceptance test.

Run with: python tests/animation-dock-geometry-browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / 'src/components/FloatingFxPortal.css').read_text()
TIMELINE_CSS = (ROOT / 'src/styles/animation.css').read_text()

HTML = '''<!doctype html><html><head><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#121420}
.app{position:relative;height:100vh;color:#eee;--panel-bg:#20243b;--border:#454865;--accent:#b7a8ff;--accent-soft:#6c58a644;--text:#eee;--muted:#a1a4b8}
.editor-grid{display:flex;height:calc(100% - 58px)}.main-editor{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.toolbar{height:34px;flex:none;background:#30354e}.creative-canvas-region{flex:1;min-height:0;background:#0f1429}
.inspector{width:210px;background:#29283d;flex:none}.statusbar{height:20px;flex:none}
.fx-overlay{border:1px solid #827fa9;border-radius:14px;background:#252840;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 35px #000b}
.fx-overlay-header{padding:12px;background:#333751}.studio-editor-view{flex:1;display:flex;flex-direction:column;min-height:0}
.studio-effect-scroll{flex:1;min-height:0;overflow-y:auto}.studio-editor-footer{padding:12px;border-top:1px solid #666}
</style><style>__TIMELINE_CSS__</style><style>__PORTAL_CSS__</style></head><body>
<div class="app"><div style="height:58px"></div><div class="editor-grid"><main class="main-editor">
<div class="toolbar"></div><div class="creative-canvas-region"></div>
<section class="animation-timeline expanded layers-view" style="height:290px">
<div class="timeline-resize-handle"><span></span></div><div class="timeline-header">Animation controls</div>
<div class="timeline-ruler-scroll"><div class="timeline-ruler"></div><div class="timeline-frames"></div></div>
<div class="timeline-layer-sheet"><div class="timeline-sheet-scroll">__ROWS__</div></div>
<div class="timeline-editbar">Exposure controls</div><div class="timeline-foot">Timeline footer</div></section>
<div class="statusbar"></div></main><aside class="inspector">Layers / Inspector</aside></div>
<div class="fx-host portal-fx-host"><div class="fx-overlay" style="top:100px;left:150px;width:345px;max-height:270px"><div class="fx-overlay-header">Hyper Outline</div>
<div class="studio-editor-view"><div class="studio-effect-scroll">__CONTROLS__</div><div class="studio-editor-footer"><button id="apply">Apply</button></div></div></div></div>
</div></body></html>'''.replace('__TIMELINE_CSS__', TIMELINE_CSS).replace('__PORTAL_CSS__', CSS).replace(
    '__ROWS__', '<div class="timeline-sheet-row">Frame cells</div>' * 28).replace(
    '__CONTROLS__', '<div style="padding:12px;height:45px">Effects slider</div>' * 15)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1050, 'height': 660}, device_scale_factor=1)
    page.set_content(HTML)
    result = page.evaluate('''() => {
      const apply = document.querySelector('#apply');
      const panel = document.querySelector('.animation-timeline');
      const fx = document.querySelector('.fx-overlay');
      const footer = apply.getBoundingClientRect();
      const found = document.elementFromPoint(footer.x + footer.width / 2, footer.y + footer.height / 2);
      const sheet = document.querySelector('.timeline-sheet-scroll');
      const result = {topmost: found?.id, timelineHeight: panel.getBoundingClientRect().height,
        sheetScrollable: sheet.scrollHeight > sheet.clientHeight, footerVisible: footer.bottom < window.innerHeight,
        dialogZ: getComputedStyle(fx.parentElement).zIndex, timelineZ: getComputedStyle(panel).zIndex};
      panel.style.height = '450px';
      result.resizedHeight = panel.getBoundingClientRect().height;
      return result;
    }''')
    assert result['topmost'] == 'apply', result
    assert result['sheetScrollable'], result
    assert result['footerVisible'], result
    assert float(result['dialogZ']) > float(result['timelineZ']), result
    assert result['timelineHeight'] == 290, result
    # Dock height must stop before consuming the reserved canvas viewport.
    assert result['resizedHeight'] == 427, result
    print('CSS/geometry browser regression PASS:', result)
    browser.close()

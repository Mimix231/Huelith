"""Real Chromium computed-style assertions for compact timeline, UI motion and theme variants.
Does not substitute for the full React application E2E test.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
styles = '\n'.join((root / 'src' / 'styles' / name).read_text() for name in (
    'app.css', 'glass.css', 'material.css', 'classic.css', 'midnight.css', 'studio.css',
    'strawberry.css', 'melon.css', 'peach.css', 'lemon.css', 'mango.css', 'sakura.css',
    'blossom.css', 'shadow.css', 'polish.css', 'typography.css', 'animation.css',
))
html = '''
<div class="app theme-strawberry tone-light">
  <main class="main-editor">
    <section class="animation-timeline expanded">
      <div class="timeline-header"><button>Frames</button></div>
      <div class="timeline-ruler-scroll">
        <div class="timeline-track"><div class="timeline-ruler">
          <div class="timeline-playhead"><span class="timeline-marker">▼</span></div>
        </div><div class="timeline-frames"><button class="timeline-frame-card selected">Frame 1</button></div></div>
      </div>
    </section>
  </main>
  <div class="fx-overlay">Effects</div>
</div>'''

with sync_playwright() as playwright:
    launch = {'headless': True, 'args': ['--no-sandbox']}
    binary = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    if binary:
        launch['executable_path'] = binary
    browser = playwright.chromium.launch(**launch)
    checks = []
    try:
        page = browser.new_page(viewport={'width': 1120, 'height': 800})
        page.set_content(f'<style>{styles}</style>{html}')

        def check(label, passed):
            assert passed, f'Chromium timeline CSS failure: {label}'
            checks.append(label)

        function = '''() => {
          const get = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
          return {
            railHeight: get('.timeline-ruler', 'height'),
            cardWidth: get('.timeline-frame-card', 'width'),
            markerPosition: get('.timeline-playhead', 'position'),
            timelineBackground: get('.animation-timeline', 'backgroundColor'),
            corner: get('.timeline-frame-card', 'borderTopLeftRadius'),
            fxMotion: get('.fx-overlay', 'animationName'),
            flexDirection: get('.animation-timeline', 'flexDirection'),
          };
        }'''
        initial = page.evaluate(function)
        check('ruler occupies compact 17px', initial['railHeight'] == '17px')
        check('frame cards are 80px wide', initial['cardWidth'] == '80px')
        check('playhead is positioned inside scrollable ruler', initial['markerPosition'] == 'absolute')
        check('FX drawer uses real entrance animation', initial['fxMotion'] == 'huelith-fx-enter')
        check('strawberry selected frames have rounded corners', initial['corner'] == '12px')
        page.locator('.app').evaluate('(element) => {element.className = "app theme-shadow tone-dark"}')
        shadow = page.evaluate(function)
        check('shadow frames have squared corners distinct from strawberry', shadow['corner'] == '3px')
        page.locator('.app').evaluate('(element) => {element.className = "app theme-melon tone-light"}')
        melon = page.evaluate(function)
        check('melon frames use independent styling', melon['corner'] == '8px')
        page.locator('.fx-overlay').evaluate('(element) => {element.parentElement.classList.add("fx-host", "closing")}')
        exiting = page.evaluate('''() => getComputedStyle(document.querySelector('.fx-overlay')).animationName''')
        check('FX drawer animates out on close', exiting == 'huelith-fx-exit')
        page.emulate_media(reduced_motion='reduce')
        reduced = page.evaluate('''() => getComputedStyle(document.querySelector('.fx-overlay')).animationName''')
        check('reduced motion disables FX transitions', reduced == 'none')
        for number, name in enumerate(checks, 1):
            print(f'PASS {number:02}: {name}')
        print(f'Chromium timeline/motion assertions: {len(checks)} passed')
    finally:
        browser.close()

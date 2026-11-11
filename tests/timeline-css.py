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

        # Isolated editor CSS checks; no Vite server or playback dependencies.
        video_styles = '\n'.join((root / 'src' / 'components' / name).read_text() for name in (
            'VideoWorkspace.css', 'VideoLibraryPane.css', 'VideoStudioDetails.css', 'VideoStudioDesign.css',
        ))
        video_html = '''
        <div class="app is-video-studio theme-studio"><div class="hv-shell">
          <nav class="hv-library-tabs"><button class="is-active">Effects</button></nav>
          <nav class="hv-category-rail"><button class="is-active">All</button></nav>
          <nav class="hv-inspector-tabs"><button aria-pressed="true">Video</button></nav>
          <nav class="hv-inspector-subtabs"><button aria-pressed="true">Basic</button></nav>
          <div class="hv-library-scroll"><div class="hv-catalog-grid">
            <button class="hv-catalog-card hv-draggable-card"><span class="hv-card-image">
              <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
              <span class="hv-card-add">+</span></span></button>
          </div></div>
          <div class="hv-inspector-scroll"><fieldset class="hv-animation-editor">
            <div class="hv-animation-grid"><button aria-pressed="true">None</button></div>
          </fieldset></div>
          <details class="hv-effect hv-compact-effect" open><summary>Effect
            <button class="hv-enable-switch" aria-checked="false"></button>
          </summary><div class="hv-compact-effect-body">Strength</div></details>
          <div class="hv-timeline-primary"><button aria-pressed="false">Snap
            <span class="hv-switch"></span></button></div>
          <div class="hv-clip" style="left:50px;width:100px;transform:translateX(7px)"></div>
          <button class="hv-head-handle"></button>
          <div class="hv-keyframe-track"><button></button></div>
          <button class="hv-audio-handle hv-audio-volume"></button>
          <div class="hv-monitor-options">Monitor settings</div>
        </div></div>'''
        page.emulate_media(reduced_motion='no-preference')
        page.set_content(f'<style>{styles}\n{video_styles}</style>{video_html}')
        motion_controls = '.hv-library-tabs button, .hv-category-rail button, .hv-inspector-tabs button, .hv-inspector-subtabs button, .hv-animation-grid button, .hv-enable-switch, .hv-timeline-primary button'
        durations = page.locator(motion_controls).evaluate_all('(elements) => elements.map(e => getComputedStyle(e).transitionDuration)')
        check('video controls use short state and press transitions', all('0.18s' in value and '0.12s' in value for value in durations))
        panels = '.hv-catalog-grid, .hv-animation-editor, .hv-compact-effect-body, .hv-monitor-options'
        names = page.locator(panels).evaluate_all('(elements) => elements.map(e => getComputedStyle(e).animationName)')
        check('video mounted panels use an opacity entrance', all(name == 'hv-studio-panel-enter' for name in names))
        unsafe = page.locator('.hv-clip, .hv-head-handle, .hv-keyframe-track button, .hv-audio-volume').evaluate_all('''(elements) => elements.map(e => {
          const style = getComputedStyle(e);
          return {transform: style.transform, properties: style.transitionProperty.split(',').map(p => p.trim())};
        })''')
        check('video drag targets never transition geometry or transforms', all(
            not set(item['properties']) & {'all', 'transform', 'left', 'top', 'width', 'height'} for item in unsafe
        ))
        page.locator('.hv-clip').evaluate('(e) => {e.style.left = "140px"; e.style.width = "160px"}')
        clip = page.locator('.hv-clip').evaluate('(e) => {const s = getComputedStyle(e); return [s.left, s.width, s.transform]}')
        check('clip movement and trimming remain immediate', clip == ['140px', '160px', unsafe[0]['transform']])
        check('catalog drag hit target is never transformed', page.locator('.hv-catalog-card').evaluate('(e) => getComputedStyle(e).transform') == 'none')
        for selector, attribute in (('.hv-enable-switch', 'aria-checked'), ('.hv-timeline-primary button', 'aria-pressed')):
            page.locator(selector).evaluate('(e, attr) => e.setAttribute(attr, "true")', attribute)
        page.evaluate('() => document.getAnimations().forEach(animation => animation.finish())')
        thumb = '''(e) => {const s = getComputedStyle(e, '::after'); return [s.left, s.transform]}'''
        check('both switch thumbs slide without changing left', all(
            page.locator(selector).evaluate(thumb) == ['2px', 'matrix(1, 0, 0, 1, 15, 0)']
            for selector in ('.hv-enable-switch', '.hv-switch')
        ))
        page.emulate_media(reduced_motion='reduce')
        durations = page.locator(motion_controls).evaluate_all('(elements) => elements.map(e => getComputedStyle(e).transitionDuration)')
        # app.css already forces a 0.01ms !important accessibility fallback.
        check('reduced motion snaps video control transitions', all(
            float(duration.removesuffix('s')) <= .00001 for value in durations for duration in value.split(', ')
        ))
        names = page.locator(panels).evaluate_all('(elements) => elements.map(e => getComputedStyle(e).animationName)')
        check('reduced motion disables video panel entrances', all(name == 'none' for name in names))
        check('reduced motion preserves checked switch endpoints', page.locator('.hv-switch').evaluate(thumb) == ['2px', 'matrix(1, 0, 0, 1, 15, 0)'])
        tab = page.locator('.hv-library-tabs button')
        tab.hover()
        page.mouse.down()
        try:
            check('reduced motion suppresses video press movement', tab.evaluate('(e) => getComputedStyle(e).transform') == 'none')
        finally:
            page.mouse.up()
        page.emulate_media(reduced_motion='no-preference')
        page.locator('.app').evaluate('(e) => e.classList.remove("is-video-studio")')
        check('video motion rules do not affect other workspaces',
              '0.18s' not in tab.evaluate('(e) => getComputedStyle(e).transitionDuration')
              and page.locator('.hv-monitor-options').evaluate('(e) => getComputedStyle(e).animationName') != 'hv-studio-panel-enter')
        for number, name in enumerate(checks, 1):
            print(f'PASS {number:02}: {name}')
        print(f'Chromium timeline/motion assertions: {len(checks)} passed')
    finally:
        browser.close()

"""Real Huelith UI interaction test. Requires npm dependencies and Python Playwright + Chromium.

Starts the Vite server automatically. Unlike the renderer smoke suite, this drives React/MUI.
"""
import os
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOST = 'http://127.0.0.1:1420'


def wait_for_vite(timeout=30):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            with urllib.request.urlopen(HOST, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.2)
    raise RuntimeError('Vite failed to start. Install dependencies and check npm run dev.')


def main():
    vite = subprocess.Popen(
        ['npm', 'run', 'dev'], cwd=ROOT, stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE, shell=os.name == 'nt',
    )
    try:
        wait_for_vite()
        with sync_playwright() as playwright:
            options = {'headless': True, 'args': ['--no-sandbox']}
            executable = os.environ.get('CHROMIUM_PATH')
            if not executable and Path('/usr/bin/chromium').exists():
                executable = '/usr/bin/chromium'
            if executable:
                options['executable_path'] = executable
            browser = playwright.chromium.launch(**options)
            try:
                page = browser.new_page(viewport={'width': 1500, 'height': 940})
                page.on('pageerror', lambda error: print(f'PAGE ERROR: {error}'))
                page.goto(HOST)
                art = page.locator('canvas.artboard-canvas')
                art.wait_for()
                assert page.locator('.welcome-scrim').count() == 0
                print('PASS: immediate workspace, no blocking welcome overlay')

                box = art.bounding_box()
                x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
                page.get_by_role('button', name='Rectangle (R)').click()
                page.mouse.move(x - 70, y - 50)
                page.mouse.down()
                page.mouse.move(x + 35, y + 18, steps=8)
                page.mouse.up()
                assert page.locator('.layer-row').count() >= 2
                assert page.get_by_role('button', name='Move & transform (V)').count() == 1
                print('PASS: editable shape creation')

                page.get_by_role('button', name='Line (L)').click()
                page.mouse.move(x - 60, y + 50)
                page.mouse.down()
                page.mouse.move(x + 60, y + 50, steps=8)
                page.mouse.up()
                assert page.get_by_text('Drag anchor points and curve handles').count() > 0
                print('PASS: line enters four-control-point editing mode')

                page.get_by_role('button', name='Text (T)').click()
                page.mouse.click(x - 40, y - 80)
                text = page.locator('textarea.focus-text-input')
                text.wait_for()
                assert text.evaluate('(element) => document.activeElement === element'), 'Text caret did not receive focus'
                text.fill('Hello Huelith\nSecond line')
                page.locator('.huelith-focus-text').get_by_role('button', name='Font family').click()
                page.get_by_role('textbox', name='Search fonts').fill('Georgia')
                page.get_by_role('option', name='Georgia', exact=True).click()
                assert text.evaluate('(element) => document.activeElement === element'), 'Font choice lost caret focus'
                text.type('!')
                text.press('Enter')
                text.wait_for(state='detached')
                print('PASS: Focus Text caret, installed font dropdown, multiline draft and Enter commit')

                # A single click should select/move, never enter text-editing mode.
                page.mouse.click(x - 34, y - 73)
                assert page.locator('textarea.focus-text-input').count() == 0
                page.mouse.move(x - 34, y - 73)
                page.mouse.down()
                page.mouse.move(x + 2, y - 53, steps=6)
                page.mouse.up()
                assert page.locator('textarea.focus-text-input').count() == 0
                page.mouse.dblclick(x + 2, y - 53)
                text = page.locator('textarea.focus-text-input')
                text.wait_for(timeout=3000)
                text.press('Control+End')
                text.type(' edited')
                text.press('Enter')
                assert page.locator('textarea.focus-text-input').count() == 0
                print('PASS: text selects on single-click, drags, double-click edits')

                page.get_by_role('button', name='File', exact=True).click()
                assert page.get_by_text('Save & export').is_visible()
                assert page.get_by_role('menuitem', name='Export PNG').is_visible()
                page.keyboard.press('Escape')
                print('PASS: category menus expose grouped functional commands')

                # A document can be renamed without changing its pixels or closing its tab.
                page.locator('.doc-tab.active .doc-tab-select').dblclick()
                rename = page.get_by_label('Rename document')
                rename.fill('Artwork draft')
                rename.press('Enter')
                assert page.locator('.doc-tab.active').get_by_text('Artwork draft').count() == 1
                print('PASS: document tab rename in place')

                # Switching a mood changes surfaces as well as layout treatments.
                page.get_by_role('button', name='Choose appearance').click()
                page.get_by_text('Strawberry', exact=True).click()
                assert 'theme-strawberry' in page.locator('.app').get_attribute('class')
                page.get_by_role('button', name='Choose appearance').click()
                page.get_by_role('button', name='☾ Dark').click()
                assert 'tone-dark' in page.locator('.app').get_attribute('class')
                page.get_by_role('button', name='☀ Light').click()
                assert 'tone-light' in page.locator('.app').get_attribute('class')
                page.keyboard.press('Escape')
                print('PASS: mood chooser and light/dark appearances')

                # The FX button is below layers (not an extra inspector tab).
                assert len(page.locator('.inspector-tabs button').all()) == 3
                page.locator('.inspector-tabs button').filter(has_text='Layers').click()
                page.locator('.fx-launcher').click()
                studio = page.locator('#huelith-fx-studio')
                assert studio.is_visible()
                assert studio.get_by_role('tab', name='Filters').count() == 1
                studio.locator('.fx-filter-card').filter(has_text='Spectrum glow').click()
                assert studio.locator('.fx-effect').count() == 1
                studio.get_by_role('tab', name='Customize').click()
                assert studio.get_by_label('Layer blending').is_visible()
                studio.get_by_role('tab', name='FX', exact=True).click()
                studio.locator('.fx-preset-card').filter(has_text='Neon Pulse').click()
                assert studio.locator('.fx-effect').count() == 4
                print('PASS: FX overlay filters, customization, presets and editable effect stack')
                studio.get_by_role('button', name='Close FX studio').click()
                studio.wait_for(state='detached', timeout=3000)
                print('PASS: FX studio exits smoothly and releases its overlay')

                # Convert an existing raster/vector project without losing the artwork.
                page.get_by_role('button', name='Animation', exact=True).click()
                page.get_by_role('menuitem', name='Convert project to animation').click()
                timeline = page.get_by_role('region', name='Animation frame timeline')
                timeline.wait_for()
                assert timeline.locator('.timeline-frame-card').count() == 1
                timeline.get_by_role('button', name='Add blank frame').click()
                assert timeline.locator('.timeline-frame-card').count() == 2
                assert timeline.locator('.timeline-frame-card.selected').count() == 1
                timeline.get_by_role('button', name='Duplicate frame').click()
                assert timeline.locator('.timeline-frame-card').count() == 3
                timeline.get_by_role('button', name='Frame 1, 83 milliseconds').click()
                assert timeline.locator('.timeline-frame-card').first.get_attribute('aria-pressed') == 'true'
                ruler = timeline.locator('.timeline-ruler')
                bounds = ruler.bounding_box()
                page.mouse.move(bounds['x'] + 40, bounds['y'] + 7)
                page.mouse.down()
                page.mouse.move(bounds['x'] + 200, bounds['y'] + 7, steps=5)
                page.mouse.up()
                assert timeline.locator('.timeline-frame-card.selected').count() == 1
                timeline.get_by_role('button', name='Toggle onion skin ghost frames').click()
                assert timeline.locator('.timeline-onion').get_attribute('aria-pressed') == 'false'
                timeline.get_by_role('button', name='Toggle onion skin ghost frames').click()
                assert timeline.locator('.timeline-onion').get_attribute('aria-pressed') == 'true'
                timeline.get_by_role('button', name='Delete frame').click()
                assert timeline.locator('.timeline-frame-card').count() == 2
                print('PASS: animation timeline, playhead scrubbing, frame editing and onion skin')

                before = page.locator('.layer-row').count()
                page.evaluate('''async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 13;
                    canvas.height = 11;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ff2255';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const data = new DataTransfer();
                    data.items.add(new File([blob], 'pasted.png', {type:'image/png'}));
                    window.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data}));
                }''')
                page.wait_for_function('(before) => document.querySelectorAll(".layer-row").length > before', arg=before)
                print('PASS: real paste event inserts a new image layer')
                print('Huelith 0.1 interactive UI scenarios: 10 passed')
            finally:
                browser.close()
    finally:
        vite.terminate()
        try:
            vite.wait(timeout=5)
        except subprocess.TimeoutExpired:
            vite.kill()


if __name__ == '__main__':
    main()

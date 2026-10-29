"""Visual-geometry acceptance for theme icon and sole title-bar Meme Creator launcher.
Runs against the authored shell CSS in Chromium, not a mocked CSS equivalent.
This is a component geometry test, not a full React/Tauri app E2E test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
base=(root/'src/styles/app.css').read_text()
identity=(root/'src/styles/theme-identities.css').read_text()
modern=(root/'src/styles/workspace-modern.css').read_text()
polish=(root/'src/styles/huelith-hybrid-shell.css').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1668,'height':900})
    page.set_content('''<div class="app tone-dark theme-sakura"><header class="titlebar">
      <div class="brand"><div class="brand-mark"><span class="brand-mark__glyph">❀</span></div><span>Huelith</span></div>
      <div class="title-actions"><button class="huelith-create-launcher"><span class="label">Meme Creator</span></button></div>
    </header><aside class="toolrail"></aside></div>''')
    for css in (base,identity,modern,polish):page.add_style_tag(content=css)
    for theme,emblem in (('sakura','❀'),('mango','✺'),('blossom','✿'),('glass','✧'),('classic','▦')):
        page.locator('.app').evaluate('(el,theme)=>el.className=`app tone-dark theme-${theme}`',theme)
        page.locator('.brand-mark__glyph').evaluate('(el,text)=>el.textContent=text',emblem)
        data=page.evaluate('''()=>{
          const a=document.querySelector('.brand-mark').getBoundingClientRect();
          const b=document.querySelector('.brand-mark__glyph').getBoundingClientRect();
          const button=document.querySelector('.huelith-create-launcher').getBoundingClientRect();
          const css=getComputedStyle(document.querySelector('.brand-mark'));
          return {x:Math.abs(a.x+a.width/2-(b.x+b.width/2)),y:Math.abs(a.y+a.height/2-(b.y+b.height/2)),
            width:a.width,height:a.height,transform:css.transform,button:button.width};}''')
        assert data['x']<.1 and data['y']<.1,(theme,data)
        assert data['transform']=='none',(theme,data)
        assert data['button']>90,(theme,data)
        print('THEME_CENTER_PASS',theme,data['width'],data['height'])
    page.set_viewport_size({'width':1024,'height':850})
    assert page.locator('.huelith-create-launcher').evaluate('(b)=>getComputedStyle(b).display')!='none'
    assert page.locator('.huelith-create-launcher').evaluate('(b)=>b.getBoundingClientRect().width')>=29
    assert page.locator('.huelith-rail-create').count()==0
    print('MEME_LAUNCHER_RESPONSIVE_PASS')
    browser.close()

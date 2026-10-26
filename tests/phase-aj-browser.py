import json,sys
from playwright.sync_api import sync_playwright
script=sys.stdin.read()
with sync_playwright() as play:
    browser=play.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    page.evaluate(script)
    metrics=page.evaluate('''() => {
      const input=document.createElement('canvas');input.width=240;input.height=160;
      const c=input.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,240,160);
      c.fillStyle='#221144';c.fillRect(55,28,125,110);
      c.fillStyle='#ffffff';c.fillRect(95,50,50,65);
      const alpha=(canvas,x,y)=>canvas.getContext('2d').getImageData(x,y,1,1).data[3];
      const rgb=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);
      const cut=(params)=>HuelithSeg.applyEffect(input,{id:'aj',kind:'cutout',enabled:true,amount:50,parameters:{
        segmentationMode:'smart',backgroundAuto:1,segmentationQuality:152,backgroundEdgeGuard:40,feather:0,decontaminate:0,...params}});
      const automatic=cut({}), keep=cut({maskStrokes:[{x:.5,y:.5,radius:10,mode:'keep'}]}),
        box=cut({subjectBox:{x:.22,y:.16,width:.56,height:.73}});
      const bgPaint=cut({segmentationMode:'manual',maskStrokes:[{x:.5,y:.5,radius:12,mode:'remove'}]});
      const legacy=cut({segmentationMode:'color',backgroundGlobal:0});
      const fastStart=performance.now();const again=cut({subjectBox:{x:.22,y:.16,width:.56,height:.73},decontaminate:10});
      return {originalRgb:rgb(input,75,60),resultRgb:rgb(box,75,60),
        border:alpha(box,5,5),purple:alpha(box,75,60),whiteInner:alpha(box,118,75),
        guidedWhite:alpha(keep,118,75),guidedPurple:alpha(keep,75,60),
        originalBackground:alpha(input,5,5),automaticBackground:alpha(automatic,5,5),
        manualCenter:alpha(bgPaint,118,75),manualElsewhere:alpha(bgPaint,75,60),
        legacyBorder:alpha(legacy,5,5),cachedMs:performance.now()-fastStart,
        secondPassCenter:alpha(again,75,60)};
    }''')
    print('PHASE_AJ_BROWSER',json.dumps(metrics))
    assert metrics['resultRgb']==metrics['originalRgb']
    assert metrics['border']==0 and metrics['purple']==255 and metrics['whiteInner']==255
    assert metrics['guidedWhite']==255 and metrics['guidedPurple']==255
    assert metrics['originalBackground']==255 and metrics['automaticBackground']==0
    assert metrics['manualCenter']==0 and metrics['manualElsewhere']==255
    assert metrics['legacyBorder']==0 and metrics['secondPassCenter']>200
    print('PHASE_AJ_PIXEL_TESTS_PASSED')
    browser.close()

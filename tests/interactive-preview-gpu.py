"""WebGL/Canvas2D integration: actual GPU-mixed output, not source regexes."""
import sys, json, os
from playwright.sync_api import sync_playwright
js = sys.stdin.read()
with sync_playwright() as p:
    chrome = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)
    launch = dict(headless=True, args=['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--enable-unsafe-swiftshader'])
    if chrome: launch['executable_path'] = chrome
    browser = p.chromium.launch(**launch)
    page = browser.new_page(viewport={'width': 840, 'height': 640})
    page.goto('about:blank')
    out = page.evaluate('''(source) => {
      const module = {exports: {}};
      new Function('module', 'exports', 'require', source)(module, module.exports, () => ({}));
      const {drawLiveStrengthPreview, mixPlan} = module.exports;
      const fx = (amount) => ({id:'glow1',kind:'glow',amount,enabled:true,color:'#aa88ff',parameters:{softness:10}});
      const oldFx = [fx(60)];
      const newFx = [fx(30)];
      if (mixPlan(oldFx, newFx)?.factor !== 0.5) throw Error('Wrong UI interpolation factor');
      if (mixPlan(oldFx, [{...fx(30), color:'#001122'}])) throw Error('Color changes require exact rendering');
      if (mixPlan([fx(60), fx(60)], [fx(30),fx(30)])) throw Error('Unsafe multi-stage interpolation');
      const sourceCanvas=document.createElement('canvas');
      sourceCanvas.width=48; sourceCanvas.height=48;
      const ctx = sourceCanvas.getContext('2d');
      ctx.fillStyle='#ff0000'; ctx.fillRect(0,0,48,24);
      ctx.fillStyle='#0000ff'; ctx.fillRect(0,24,48,24);
      const exact=document.createElement('canvas'); exact.width=48; exact.height=48;
      const e=exact.getContext('2d');
      e.fillStyle='#00ff00'; e.fillRect(0,0,48,24);
      e.fillStyle='#ffffff'; e.fillRect(0,24,48,24);
      const target=document.createElement('canvas'); target.width=48; target.height=48;
      const t=target.getContext('2d');
      function sample(amount) {
        t.clearRect(0,0,48,48);
        if (!drawLiveStrengthPreview(t,sourceCanvas,exact,oldFx,[fx(amount)],48,48)) return null;
        const top=t.getImageData(4,4,1,1).data;
        const bottom=t.getImageData(4,44,1,1).data;
        return { top: [...top], bottom: [...bottom] };
      }
      const half=sample(30), end=sample(59), stronger=sample(90);
      if (half === null || end === null) throw Error('Canvas2D interpolation unavailable: '+JSON.stringify({half,end, plan:mixPlan(oldFx,newFx)}));
      const gpuAvailable = !!document.createElement('canvas').getContext('webgl2');
      const near = (n,a,err=10) => Math.abs(n-a)<=err;
      if (!near(half.top[0],128) || !near(half.top[1],128) || !near(half.top[2],0))
        throw Error('Half-strength top pixels not interpolated: '+JSON.stringify(half));
      if (!near(half.bottom[0],128) || !near(half.bottom[1],128) || !near(half.bottom[2],255))
        throw Error('Half-strength bottom pixels not interpolated/or vertically flipped: '+JSON.stringify(half));
      if (!near(end.top[1],255) || !near(end.top[0],0)) throw Error('Exact anchor did not match: '+JSON.stringify(end));
      if (gpuAvailable && (!stronger || stronger.top[1] < half.top[1] + 50)) throw Error('GPU extrapolation was not live');
      const wide=document.createElement('canvas'); wide.width=960; wide.height=540;
      const w=wide.getContext('2d'); w.drawImage(sourceCanvas,0,0,960,540);
      const processed=document.createElement('canvas'); processed.width=960; processed.height=540;
      processed.getContext('2d').drawImage(exact,0,0,960,540);
      const viewport=document.createElement('canvas'); viewport.width=960; viewport.height=540;
      const v=viewport.getContext('2d');
      const start=performance.now();
      for (let i=0;i<30;i++) {
        if (!drawLiveStrengthPreview(v,wide,processed,oldFx,[fx(20+i)],960,540)) throw Error('Interactive preview missing');
      }
      return {gpuAvailable, half, end, stronger, benchmarkMsFor30Frames: +(performance.now()-start).toFixed(1)};
    }''', js)
    print('Chromium native-resolution live interpolation:', json.dumps(out))
    if not out.get('gpuAvailable'):
        print('NOTE: this Chromium container has no WebGL2; tested Canvas2D fallback. GPU path still requires Windows verification.')
    browser.close()

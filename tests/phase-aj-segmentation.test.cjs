const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const input = (w = 240, h = 160) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const fg = x >= 55 && x < 180 && y >= 28 && y < 138;
    const white = fg && x >= 95 && x < 145 && y >= 50 && y < 115;
    data[i] = fg && !white ? 34 : 255;
    data[i + 1] = fg && !white ? 17 : 255;
    data[i + 2] = fg && !white ? 68 : 255;
    data[i + 3] = 255;
  }
  return {width:w,height:h,data};
};
const mod = {exports:{}};
const code = ts.transpileModule(source('src/editor/subject-segmentation.ts'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
new Function('module','exports',code)(mod,mod.exports);
const {segmentSubject} = mod.exports;
const at = (a,w,x,y) => a[y*w+x];
const base = {strength:50,edgeProtection:40,quality:152,strokes:[]};
test('Smart graph-cut removes contrasting background without deleting subject', () => {
  const art = input(), copy = Uint8ClampedArray.from(art.data);
  const matte = segmentSubject(art,base);
  assert.equal(matte.length,art.width*art.height);
  assert.equal(at(matte,240,5,5),0);
  assert.equal(at(matte,240,75,60),255);
  assert.deepEqual(art.data,copy,'Segmentation must never modify source pixels');
});
test('Foreground guidance protects white details while retaining colored material', () => {
  const matte=segmentSubject(input(),{...base,strokes:[{x:.5,y:.5,radius:10,mode:'keep'}]});
  assert.equal(at(matte,240,118,75),255);
  assert.equal(at(matte,240,75,60),255);
  assert.equal(at(matte,240,5,5),0);
});
test('Subject rectangle supports dissimilar-colored foreground and white details', () => {
  const matte=segmentSubject(input(),{...base,subjectBox:{x:.22,y:.16,width:.56,height:.73}});
  assert.equal(at(matte,240,118,75),255);
  assert.equal(at(matte,240,75,60),255);
  assert.equal(at(matte,240,5,5),0);
});
test('Uniform document remains intact instead of erasing everything', () => {
  const art = input(90,70);
  for(let i=0;i<art.data.length;i+=4) art.data[i]=art.data[i+1]=art.data[i+2]=255;
  const matte=segmentSubject(art,base);
  assert.equal(at(matte,90,40,30),255);
});
test('Re-running identical segmentation is deterministic', () => {
  const art=input(200,140), a=segmentSubject(art,base), b=segmentSubject(art,base);
  assert.deepEqual(a,b);
});
test('Engine modes, controls and full workspace are registered, with no network downloads', () => {
  const effectOps=source('src/editor/effect-ops.ts');
  const editor=source('src/components/EffectAdvancedEditors.tsx');
  const types=source('src/editor/types.ts');
  const schema=source('src/editor/effect-schema.ts');
  assert.match(effectOps,/segmentSubject\(image,/);
  assert.match(editor,/Smart — guided graph cut/);
  assert.match(editor,/Manual — brush mask only/);
  assert.match(editor,/Subject rectangle/);
  assert.match(editor,/Huelith Mask Workspace/);
  assert.match(schema,/values\.segmentationMode = 'smart'/);
  assert.match(types,/segmentationMode\?: 'smart' \| 'color' \| 'manual'/);
  assert.doesNotMatch(source('src/editor/subject-segmentation.ts'),/fetch\(|https:\/\//);
});

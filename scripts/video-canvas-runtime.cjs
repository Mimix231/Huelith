/* A real Canvas2D backend for offline asset rendering and pixel tests. */
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const canvas=require('@napi-rs/canvas');
Module._extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},
}).outputText.replace(/\bimport\.meta\.url\b/g,JSON.stringify(require('node:url').pathToFileURL(filename).href)),filename);
global.ImageData=canvas.ImageData;global.Image=canvas.Image;global.HTMLImageElement=canvas.Image;
global.HTMLCanvasElement=canvas.Canvas;global.HTMLVideoElement=class HTMLVideoElement{};
global.document={createElement(kind){if(kind==='canvas')return canvas.createCanvas(1,1);throw Error(`Unexpected headless element ${kind}`);}};
global.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),0);
global.cancelAnimationFrame=clearTimeout;
module.exports=canvas;

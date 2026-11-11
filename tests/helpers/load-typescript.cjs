const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
exports.loadTypeScript=function(file){
  const previous=Module._extensions['.ts'];
  Module._extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText,filename);
  try{return require(path.resolve(file));}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
};

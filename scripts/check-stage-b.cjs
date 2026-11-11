// Syntax/AST scan of modified TypeScript and TSX files without depending on
// missing React/MUI node_modules (full check remains a separate release gate).
const ts=require('typescript');
const fs=require('node:fs');
const filenames=[
  'src/App.tsx','src/editor/files.ts','src/editor/video/native-media.ts',
  'src/components/VideoWorkspace.tsx',
];
let failures=0;
for(const file of filenames){
  const source=fs.readFileSync(file,'utf8');
  const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length) {failures+=errors.length;for(const diagnostic of errors)console.error(file,ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'));}
  else console.log('AST clean',file);
}
if(failures)process.exitCode=1;

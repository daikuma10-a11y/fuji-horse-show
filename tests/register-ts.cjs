// Load real shared TS/TSX components in standalone Node regression tests.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module')
const resolve=Module._resolveFilename
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(__dirname,'..',id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)

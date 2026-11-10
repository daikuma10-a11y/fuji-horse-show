require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript')
const {fitTimetablePrint}=require('../lib/master/timetable-print.ts')
let states=[],index=0,busy=false,calls=[]
const hooks={useState(initial){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]}}
const file=path.resolve('components/master/timetable.tsx'),mod=new Module(file,module);mod.paths=module.paths
mod.require=id=>id==='react'?hooks:id==='./pdf-download'?{PdfDownload:()=>null}:id==='./use-print-document'?{usePrintDocument:()=>({busy,notice:'',error:'',print:(load,orientation,fit)=>calls.push({load,orientation,fit})})}:require(id)
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file)
const dates=[{value:'2026-11-13',label:'11/13(金)'},{value:'2026-11-14',label:'11/14(土)'},{value:'2026-11-15',label:'11/15(日)'}]
const render=()=>{index=0;return mod.exports.MasterTimetable({title:'test',dates,items:[],renderEditor:()=>null,loadPrint:async selected=>[...selected]})}
const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&n.props.children===label)
const checks=tree=>nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox')
const primary=tree=>button(tree,'選択した日程を1ページで印刷・PDF保存')
;(async()=>{
 let tree=render();assert.equal(checks(tree).length,3);assert(checks(tree).every(c=>c.props.checked))
 checks(tree)[0].props.onChange({target:{checked:false}});tree=render();primary(tree).props.onClick()
 assert.deepEqual(await calls[0].load(),['2026-11-14','2026-11-15']);assert.equal(calls[0].orientation,'横');assert.equal(calls[0].fit,fitTimetablePrint)
 button(tree,'全日程を選択').props.onClick();tree=render();primary(tree).props.onClick();assert.deepEqual(await calls[1].load(),dates.map(d=>d.value))
 assert.deepEqual(await calls[0].load(),['2026-11-14','2026-11-15'],'earlier print selection is frozen')
 for(const check of checks(tree))check.props.onChange({target:{checked:false}})
 tree=render();assert(primary(tree).props.disabled);primary(tree).props.onClick();assert.equal(calls.length,2)
 const shortcut=nodes(tree).find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children[0]==='11/14(土)');shortcut.props.onClick();assert.deepEqual(await calls[2].load(),['2026-11-14'])
 busy=true;tree=render();assert(primary(tree).props.disabled);assert(nodes(tree).find(n=>n.type==='fieldset').props.disabled)
 console.log('PASS: three date checkboxes; Saturday+Sunday share one print call; all dates; empty selection blocked; frozen selection; single-day shortcut; fitting wired; busy controls locked')
})().catch(e=>{console.error(e);process.exitCode=1})

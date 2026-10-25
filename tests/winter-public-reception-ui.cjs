// DOM interaction test. Set JSDOM_MODULE to an installed jsdom package when not in node_modules.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.example.test/winter/confirm'})
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent'])global[key]=key==='window'?dom.window:dom.window[key]
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client')
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>{const original=m.require.bind(m);m.require=name=>name==='next/link'?{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}:original(name);m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)}
const {queue}=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),Page=require('../app/winter/confirm/page.tsx').default
const el=document.getElementById('root');let root,mode='offline',sent=[]
global.fetch=async(url,options)=>{assert.equal(url,'/api/winter-reception');if(options.method!=='POST')return Response.json({ready:true});sent.push(options.body);if(mode==='offline')throw Error('offline');const b=JSON.parse(options.body);return Response.json({ids:b.p_items.map(x=>x.args.p_id),total:b.p_expected_total})}
async function mount(){root=createRoot(el);await act(async()=>{root.render(React.createElement(Page))})}
async function submit(){await act(async()=>{el.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(setImmediate)})}
;(async()=>{
 batch.writeWinterQueue(window.localStorage,queue);await mount()
 assert.equal(el.querySelectorAll('input').length,1);assert.ok(el.textContent.includes('受付に来た方のお名前'));assert.ok(!el.textContent.includes('本部ログイン'));assert.equal(el.querySelector('button[type="submit"]').disabled,true)
 const input=el.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'受付来訪者');input.dispatchEvent(new Event('input',{bubbles:true}))})
 assert.equal(el.querySelector('button[type="submit"]').disabled,false)
 await submit();assert.ok(el.textContent.includes('offline'));assert.equal(el.querySelector('input').disabled,true);assert.equal(batch.readWinterQueue(window.localStorage).visitorName,'受付来訪者')
 await act(async()=>root.unmount());await mount();assert.equal(el.querySelector('input').value,'受付来訪者');assert.equal(el.querySelector('input').disabled,true)
 mode='ok';await submit();assert.ok(el.textContent.includes('3件を確定しました'));assert.equal(batch.readWinterQueue(window.localStorage).items.length,0);assert.equal(new Set(sent).size,1)
 await act(async()=>root.unmount());dom.window.close()
 console.log('PASS: rendered final screen has one visitor field and no login; blank blocks submission; network failure locks name and IDs through remount; retry confirms all three and clears only acknowledged queue')
})().catch(e=>{console.error(e);process.exitCode=1})

// Synthetic browser rendering only. No signed-in page, live data or API writes.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{chromium}=require('playwright')
const {MasterStartRows}=require('../components/master/start-list-rows.tsx'),{MasterStartLegend}=require('../components/master/start-list-controls.tsx')
const entries=Array.from({length:12},(_,i)=>({id:'e'+i,competitionId:'c',order:i+1,playerId:[0,5,10].includes(i)?'rA':[2,8].includes(i)?'rB':'r'+i,horseId:[1,7].includes(i)?'hA':[4,9].includes(i)?'hB':'h'+i,isOp:i===1,adminChangeMark:i===0?'added':i===2?'changed':undefined}))
const model={entriesByCompetition:()=>entries,getPlayer:id=>({id,name:id==='rA'?'鈴木 太郎':id==='rB'?'佐藤 花子':'テスト選手'+id,orgId:'org'}),getHorse:id=>({id,name:id==='hA'?'サンプルスター':id==='hB'?'テストホース':'確認用馬'+id,orgId:'org'}),getOrg:id=>({id,name:'確認用クラブ'})}
const cssDir=path.resolve('.next/static/css'),css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n')
const font=process.env.LAYOUT_TEST_FONT ? `@font-face{font-family:TestJapanese;src:url(data:font/otf;base64,${fs.readFileSync(process.env.LAYOUT_TEST_FONT).toString('base64')})}body{font-family:TestJapanese,sans-serif}` : ''
const out=process.env.START_REPEAT_OUTPUT
function html(ids){return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}${font}</style></head><body><main style="padding:16px">${renderToStaticMarkup(React.createElement(MasterStartLegend))}${renderToStaticMarkup(React.createElement(MasterStartRows,{model,competitionId:'c',showAdminChanges:true,readOnly:true,adminReorder:true,compact:true,dense:true,orderedIds:ids,onReorder(){}}))}</main></body></html>`}
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu','--disable-webgl']})
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort())
  for(const viewport of [{width:1366,height:768},{width:1024,height:768},{width:768,height:1024}]){
   await page.setViewportSize(viewport);await page.setContent(html(entries.map(e=>e.id)))
   const marks=page.locator('[data-repeat-kind]');assert.equal(await marks.count(),9)
   for(const mark of await marks.all()){
    assert(await mark.isVisible());assert(await mark.locator('span').first().isVisible())
    const geometry=await mark.evaluate(el=>({width:el.clientWidth,label:el.children[0].getBoundingClientRect().width,name:el.children[1].getBoundingClientRect().width,height:el.getBoundingClientRect().height}))
    assert(geometry.name>12&&geometry.width>geometry.label&&geometry.height>10,'badge leaves visible space for the name')
   }
   const signature=()=>page.locator('[data-start-entry-id]').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.dataset.startEntryId,Array.from(row.querySelectorAll('[data-repeat-kind]')).map(mark=>[mark.dataset.repeatKind,mark.dataset.repeatGroup,getComputedStyle(mark).backgroundColor])])) )
   const before=await signature();await page.setContent(html(entries.map(e=>e.id).reverse()));assert.deepEqual(await signature(),before)
   assert.equal(await page.getByTitle('押したまま上下に動かす').count(),12)
   if(out&&viewport.width===1366){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'repeated-names.png'),fullPage:true})}
   console.log(`PASS: ${viewport.width}x${viewport.height}; colored names/numbered labels visible; reorder stable; original move handles retained`)
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

// Run after npm run build, with Playwright available and CHROMIUM_PATH if needed.
// Synthetic HTML only: never open the signed-in admin page or call application APIs.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{chromium}=require('playwright')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const fixture=require('./winter-application-fixture.cjs'),preparation=require('../config/winter-2026-preparation.json')
const app=fixture(),noop=()=>{}
app.entries=Array.from({length:15},(_,i)=>({...app.entries[0],key:`layout-${i}`}))
const original=JSON.stringify(app)
const props={busy:false,message:'',error:'',fileName:app.fileName,eventName:'合成大会',formatDescription:'合成様式',original:app,edited:app,reference:'LAYOUT-TEST',paid:'0',accountChecked:true,
 review:{amounts:[],issues:[],entryPrices:Array(15).fill(5000),entryFeeTotal:75000,horseRegistration:{count:1,unit:14000},ready:true},
 candidates:{},choices:{r1:'new',h1:'new'},rosterLoaded:true,differences:null,revisionName:'',rosterPrepared:true,competitions:preparation.competitions}
for(const key of ['onFiles','onRead','onRestoreFile','onSave','onOpenSaved','onDownload','onLoadRoster','onReset','onReference','onClub','onPaid','onAccountChecked','onPerson','onEntry','onAmount','onChoice','onPrepareRoster','onAddEntry'])props[key]=noop
const cssDir=process.env.APPLICATION_LAYOUT_CSS_DIR||path.join(__dirname,'../.next/static/css')
const css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n')
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}</style></head><body><main hidden style="max-width:1200px;margin:auto;padding:20px">${renderToStaticMarkup(React.createElement(MasterApplicationReview,props))}</main></body></html>`
;(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu','--disable-webgl']})
 try{
  const page=await browser.newPage()
  await page.route('**/*',route=>route.abort())
  for(const viewport of [{width:1366,height:768},{width:1024,height:768},{width:900,height:600},{width:768,height:1024},{width:600,height:768}]){
   await page.setViewportSize(viewport);await page.setContent(html)
   await page.evaluate(()=>document.querySelector('main').hidden=false)
   const region=page.getByRole('region',{name:'エントリー一覧の表'}),rows=region.locator('tbody tr')
   assert.equal(await rows.count(),15)
   const initial=await region.boundingBox();assert(initial.height>=Math.min(384,viewport.height*.7)-1)
   // Reproduce a collapsed auto-height result. The fallback must still expose the
   // first and last entries; this is a guard test, not a reproduction of the PC bug.
   await region.evaluate(el=>el.style.height='0px')
   assert((await region.boundingBox()).height>=Math.min(384,viewport.height*.7)-1)
   for(const row of [rows.first(),rows.last()]){
    const control=row.locator('select').first();await control.scrollIntoViewIfNeeded()
    const panel=await region.boundingBox(),box=await control.boundingBox()
    assert(box&&box.height>0&&box.y<panel.y+panel.height&&box.y+box.height>panel.y,'entry control remains reachable inside the scroll area')
    assert.equal(await row.locator('select').count(),3)
    assert(await row.getByRole('checkbox').isVisible())
   }
   assert.equal(await region.locator('select').count(),45)
   assert((await page.getByLabel('今回のExcelの料金合計').innerText()).includes('75,000円'))
   console.log(`PASS: ${viewport.width}x${viewport.height}; 15 entries; tab reveal; collapsed-height guard; first/last controls; total retained`)
  }
  assert.equal(JSON.stringify(app),original)
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

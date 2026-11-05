// Run winter-timetable-print.cjs first with TIMETABLE_TEST_OUTPUT set.
// Synthetic HTML only; all seven date combinations plus overflowing names.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright')
const {fitTimetablePrint}=require('../lib/master/timetable-print.ts')
const output=process.env.TIMETABLE_TEST_OUTPUT
if(!output)throw Error('Set TIMETABLE_TEST_OUTPUT to the fixture output directory')
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu','--disable-webgl']})
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});await page.route('**/*',r=>r.abort())
  for(const fixture of [...Array.from({length:7},(_,i)=>`selection-${i+1}`),'long']){
   let html=fs.readFileSync(path.join(output,fixture+'.html'),'utf8')
   if(process.env.LAYOUT_TEST_FONT)html=html.replace('</style>',`@font-face{font-family:TestJapanese;src:url(data:font/otf;base64,${fs.readFileSync(process.env.LAYOUT_TEST_FONT).toString('base64')})}body{font-family:TestJapanese,sans-serif}</style>`)
   await page.emulateMedia({media:'screen'});await page.setContent(html);await page.evaluate(()=>document.fonts.ready)
   // Run the production fitter, including its repeat/beforeprint path.
   const runFit=()=>page.evaluate(`(${fitTimetablePrint.toString()})(document)`)
   await runFit();const screenScale=await page.locator('[data-timetable-sheet]').getAttribute('data-print-scale')
   await page.emulateMedia({media:'print'});await runFit();await runFit()
   assert.equal(await page.locator('[data-timetable-sheet]').count(),1)
   assert.equal(await page.locator('[data-timetable-sheet]').getAttribute('data-print-scale'),screenScale,'fitting is stable across print media and repeated prints')
   const mask=fixture==='long'?7:Number(fixture.split('-')[1]),expected=[4,18,18].reduce((sum,n,i)=>sum+(mask&(1<<i)?n:0),0)
   assert.equal(await page.locator('[data-competition-id]').count(),expected)
   const bounds=await page.evaluate(()=>{
    const sheet=document.querySelector('[data-timetable-sheet]').getBoundingClientRect()
    const inside=Array.from(document.querySelectorAll('[data-competition-id],header,footer')).every(el=>{const r=el.getBoundingClientRect();return r.top>=sheet.top-1&&r.left>=sheet.left-1&&r.right<=sheet.right+1&&r.bottom<=sheet.bottom+1})
    return{inside,scale:Number(document.querySelector('[data-timetable-sheet]').dataset.printScale)}
   })
   assert(bounds.inside,'every competition and all notes fit within the printable sheet; no clipping')
   assert(bounds.scale>0&&bounds.scale<=1)
   // Exercise the real beforeprint hook from screen media, including browser headers/footers.
   await page.emulateMedia({media:null})
   await page.evaluate(`window.onbeforeprint=()=>(${fitTimetablePrint.toString()})(document)`)
   const names=await page.locator('[data-competition-id] td:nth-child(2)').allTextContents()
   const normalize=value=>value.replace(/\s/g,'')
   for(const headers of [false,true]){
    const filename=path.join(output,fixture+(headers?'-headers':'')+'.pdf')
    const pdf=await page.pdf({path:filename,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:headers,headerTemplate:'<span class="date" style="font-size:8px"></span>',footerTemplate:'<span class="pageNumber" style="font-size:8px"></span>/<span class="totalPages" style="font-size:8px"></span>'})
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'all selected dates must share a single sheet')
    const printed=normalize(execFileSync('pdftotext',['-raw',filename,'-'],{encoding:'utf8'}))
    assert(!printed.includes('印刷・PDF保存'),'the screen toolbar must not be printed')
    for(const name of names)assert(printed.includes(normalize(name)),`PDF must contain the entire competition name: ${name}`)
    assert(printed.includes('最新のタイムテーブルをご確認ください。'),'the last footer must be in the PDF itself')
   }
   console.log(`PASS: ${fixture}; ${expected} competition names and footer in both PDFs; 1 A4 page with/without headers; scale ${bounds.scale.toFixed(3)}`)
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

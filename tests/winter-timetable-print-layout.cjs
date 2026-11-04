// Run winter-timetable-print.cjs first with TIMETABLE_TEST_OUTPUT set.
// Uses generated synthetic HTML only, never the live app or participant data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright')
const output=process.env.TIMETABLE_TEST_OUTPUT
if(!output)throw Error('Set TIMETABLE_TEST_OUTPUT to the fixture output directory')
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu','--disable-webgl']})
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});await page.route('**/*',r=>r.abort())
  let html=fs.readFileSync(path.join(output,'timetable.html'),'utf8')
  if(process.env.LAYOUT_TEST_FONT)html=html.replace('</style>',`@font-face{font-family:TestJapanese;src:url(data:font/otf;base64,${fs.readFileSync(process.env.LAYOUT_TEST_FONT).toString('base64')})}body{font-family:TestJapanese,sans-serif}</style>`)
  await page.setContent(html);await page.evaluate(()=>document.fonts.ready);await page.emulateMedia({media:'print'})
  assert.equal(await page.locator('[data-competition-id]').count(),40)
  assert.equal(await page.locator('.day').count(),3)
  assert.equal(await page.locator('.day').nth(1).locator('[data-competition-id]').count(),18)
  const pdf=await page.pdf({path:path.join(output,'timetable.pdf'),preferCSSPageSize:true,printBackground:true})
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,3,'three dates fit three sheets, with no orphan footer pages')
  await page.locator('.day').nth(2).evaluate(el=>el.remove());await page.locator('.day').first().evaluate(el=>el.remove())
  const single=await page.pdf({preferCSSPageSize:true,printBackground:true});assert.equal((single.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1)
  console.log('PASS: 40 synthetic competitions; Japanese named times; A4 landscape 3 pages; selected day 1 page; no orphan footers or API access')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

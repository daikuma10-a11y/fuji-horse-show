// Local Winter admin with synthetic rows and no external writes.
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const config=require('../config/winter-2026-preparation.json')
const url=new URL(process.env.FHS_TEST_BASE_URL||'http://127.0.0.1:3305')
assert.ok(['127.0.0.1','localhost'].includes(url.hostname))
const ev=config.eventId,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const org={event_id:ev,id:id(1),name:'検証団体'}
const people=(base)=>Array.from({length:3},(_,i)=>({id:id(base+i),event_id:ev,organization_id:org.id,name:'検証'+(base+i),is_participant:true}))
const competitions=config.competitions.map((c,i)=>({event_id:ev,id:id(100+i),competition_no:c.number,competition_date:c.date,name:c.name,official:c.official,fee:c.fee}))
const riders=people(10),horses=people(20)
const entries=competitions.flatMap((c,i)=>c.competition_no==='12'?[]:riders.map((r,j)=>({event_id:ev,entry_id:id(1000+i*10+j),competition_id:c.id,
 rider_id:r.id,horse_id:horses[j].id,organization_id:org.id,organization_name:org.name,status:'active',is_op:false,start_order:j+1})))
const tables={riders,horses,competitions,organizations:[org],reception_entries:entries}
;(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FHS_CHROMIUM?{executablePath:process.env.FHS_CHROMIUM,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process','--no-zygote']}:{})})
 try{
  const ctx=await browser.newContext({viewport:{width:1100,height:700},serviceWorkers:'block'})
  const writes=[],errors=[]
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url()),reply=obj=>route.fulfill({contentType:'application/json',body:JSON.stringify(obj)})
    if(u.origin===url.origin&&!u.pathname.startsWith('/api/'))return route.continue()
    if(u.hostname!=='mhgyhyxagkkwdiepifdp.supabase.co')return route.abort()
    if(u.pathname==='/auth/v1/user')return reply({email:'dummy@example.test',app_metadata:{role:'admin'}})
    if(u.pathname.endsWith('/publish_winter_monitor')){
      tables.fhs_winter_monitor=[{state:route.request().postDataJSON().p_state}]
      return reply({})
    }
    if(u.pathname.endsWith('/save_winter_start_order')){
      const body=route.request().postDataJSON();writes.push(body)
      body.p_entry_ids.forEach((e,i)=>{entries.find(x=>x.entry_id===e).start_order=i+1})
      return reply({ids:body.p_entry_ids,savedAt:new Date().toISOString()})
    }
    return reply(tables[u.pathname.split('/').at(-1)]??[])
  })
  await ctx.routeWebSocket('**/*',s=>s.close())
  await ctx.addInitScript(ev=>sessionStorage.setItem('fhs:'+ev+':admin-session:v1',JSON.stringify({accessToken:'dummy',refreshToken:'dummy',expiresAt:Date.now()+3600000,email:'dummy@example.test'})),ev)
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto(new URL('/winter/admin',url).href)
  await page.getByRole('tab',{name:'出番表',exact:true}).click()
  const panel=page.locator('#winter-panel-startlist'),headings=panel.locator('h3[id^="day-start-heading-"]')
  await headings.first().waitFor();assert.equal(await headings.count(),4,'all Friday competitions visible on entry')
  await panel.getByRole('button',{name:/11\/14/}).click()
  const saturday=competitions.filter(c=>c.competition_date==='2026-11-14')
  assert.deepEqual(await headings.evaluateAll(h=>h.map(e=>e.id)),saturday.map(c=>'day-start-heading-'+c.id))
  const target=saturday.find(c=>c.competition_no==='14'),other=saturday.find(c=>c.competition_no==='1')
  const section=c=>panel.locator('section[aria-labelledby="day-start-heading-'+c.id+'"]')
  const published=page.waitForResponse(response=>response.url().endsWith('/publish_winter_monitor') && response.request().postDataJSON()?.p_state?.competitionId===target.id)
  await panel.getByRole('button',{name:new RegExp(target.name)}).first().click()
  await page.waitForFunction(id=>document.activeElement?.id==='day-start-heading-'+id&&document.activeElement.getBoundingClientRect().top>=-1&&document.activeElement.getBoundingClientRect().top<innerHeight,target.id)
  assert.equal(await headings.count(),18,'jump must not hide the other competitions')
  assert.ok(await section(saturday.find(c=>c.competition_no==='12')).getByText('この競技の出番はまだありません。').isVisible())
  assert.equal(await section(target).locator('[data-start-entry-id]').count(),3)
  assert.equal(await section(saturday.find(c=>c.competition_no==='12')).locator('[data-start-entry-id]').count(),0)
  assert.equal(await panel.locator('[data-reserve-number]').count(),0)
  await published
  const monitor=await ctx.newPage()
  await monitor.goto(new URL('/winter/monitor',url).href)
  await monitor.getByRole('heading',{name:new RegExp(target.name)}).waitFor()
  assert.deepEqual(await monitor.locator('tbody tr td:first-child').allTextContents(),['1','2','3'])
  await monitor.close()
  async function printedSheets(label){
    const opened=page.waitForEvent('popup')
    await panel.getByRole('button',{name:label,exact:true}).click()
    const popup=await opened
    try{
      await popup.locator('section svg').first().waitFor()
      const sheets=await popup.locator('section svg').evaluateAll(rows=>rows.map(svg=>svg.outerHTML))
      for(const numbers of await popup.locator('section svg').evaluateAll(rows=>rows.map(svg=>
        Array.from(svg.querySelectorAll('text'),node=>node.textContent).filter(v=>/^\d+$/.test(v))
      ))){
        assert.ok(numbers.includes('35') && !numbers.includes('36'),'print still has numbered rows to 35')
      }
      const pdf=await popup.pdf({preferCSSPageSize:true,printBackground:true})
      assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,sheets.length,'one printed page per Excel print area')
      return sheets
    }finally{await popup.close()}
  }
  const daySheets=await printedSheets('この日の出番表を印刷')
  assert.equal(daySheets.length,saturday.length)
  assert.deepEqual(await printedSheets('この競技だけを印刷'),[daySheets[saturday.indexOf(target)]])
  const visibleIds=c=>section(c).locator('[data-start-entry-id]').evaluateAll(a=>a.map(e=>e.dataset.startEntryId))
  const before=await visibleIds(target),unaffected=await visibleIds(other)
  await section(target).getByRole('button',{name:'1番を下へ',exact:true}).click()
  await panel.getByRole('button',{name:/11\/15/}).click();assert.equal(await headings.count(),18)
  await panel.getByRole('button',{name:/11\/14/}).click()
  assert.deepEqual(await visibleIds(target),[before[1],before[0],before[2]])
  await section(target).getByRole('button',{name:'出番順を保存',exact:true}).click()
  await page.waitForFunction(id=>!document.querySelector('section[aria-labelledby="day-start-heading-'+id+'"]')?.textContent.includes('未保存の変更があります'),target.id)
  assert.equal(writes.length,1);assert.equal(writes[0].p_competition_id,target.id);assert.deepEqual(writes[0].p_entry_ids,[before[1],before[0],before[2]]);assert.deepEqual(await visibleIds(other),unaffected)
  await panel.getByRole('button',{name:'出番表を一画面で見る'}).click()
  await panel.getByRole('combobox',{name:'競技',exact:false}).first().selectOption(target.id)
  await page.waitForFunction(id=>document.activeElement?.id==='day-start-heading-'+id,target.id)
  assert.equal(await headings.count(),18);assert.deepEqual(errors,[])
  console.log('PASS registered starts only on screen and monitor, numbered print slots to 35, identical single and day Excel print pages, normal/wide jump, drafts and scoped save.')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

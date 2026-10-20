// Local UI regression only. All remote HTTP/WebSocket traffic is intercepted.
const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const config=require('../config/winter-2026-preparation.json')
const base=process.env.FHS_TEST_BASE_URL||'http://127.0.0.1:3305'
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server only')
const ev=config.eventId,uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org={event_id:ev,id:uid(1),name:'テストUI団体'}
const rider={event_id:ev,id:uid(2),name:'テストUI選手',organization_id:org.id,jef_member_no:null,is_participant:true}
const horse={event_id:ev,id:uid(3),name:'テストUI馬',organization_id:org.id,jef_registration_no:null,is_participant:true}
const competition=config.competitions.find(c=>c.number==='5')
const comp={event_id:ev,id:uid(4),competition_no:competition.number,competition_date:competition.date,name:competition.name,official:competition.official,fee:competition.fee,op_fee:competition.opFee,member_fee:competition.memberFee,nonmember_fee:competition.nonmemberFee}
const entities=[rider,horse].map((row,i)=>({id:uid(12+i),kind:i?'horse':'rider',name:row.name,reading:'テスト',jef_number:null,updated_at:'2026-10-20T00:00:00Z',archived_at:null}))
const tables={organizations:[org],riders:[rider],horses:[horse],competitions:[comp],reception_entries:[],reception_requests:[],fhs_roster_entities:entities,fhs_roster_clubs:[{id:uid(11),name:org.name}],fhs_roster_affiliations:entities.map((e,i)=>({id:uid(20+i),entity_id:e.id,club_id:uid(11),started_at:'2026-10-20T00:00:00Z',ended_at:null})),fhs_winter_participants:[]}
;(async()=>{
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'})
  const errors=[],writes=[],remote=[],apiErrors=[]
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.origin===new URL(base).origin&&!url.pathname.startsWith('/api/'))return route.continue()
   remote.push(url.pathname)
   const reply=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)})
   if(url.hostname!=='mhgyhyxagkkwdiepifdp.supabase.co')return route.abort()
   if(request.method()!=='GET'){writes.push(url.pathname);return route.abort()}
   if(url.pathname==='/auth/v1/user')return reply({email:'ui-test@example.test',app_metadata:{role:'admin'}})
   const event=url.searchParams.get('event_id')
   if(event&&event!==`eq.${ev}`){apiErrors.push('Non-Winter event');return route.abort()}
   return reply(tables[url.pathname.split('/').at(-1)]||[])
  })
  await context.routeWebSocket('**/*',socket=>socket.close())
  await context.addInitScript(({ev})=>{
   sessionStorage.setItem(`fhs:${ev}:admin-session:v1`,JSON.stringify({accessToken:'synthetic-ui-token',refreshToken:'synthetic-ui-refresh',expiresAt:Date.now()+3600000,email:'ui-test@example.test'}))
  },{ev})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/winter/admin')
  await page.getByRole('tab',{name:'事前登録',exact:true}).waitFor()
  assert.equal(await page.getByRole('tab',{name:'人馬名簿',exact:true}).count(),0)
  assert.equal(await page.getByRole('link',{name:'CSV・TSVの取込準備を開く',exact:true}).count(),0)
  await page.getByRole('tab',{name:'事前登録',exact:true}).click()
  const roster=page.locator('#pre-registration-roster'),entries=page.locator('#pre-registration-entries')
  await roster.getByLabel('共通名簿の所属団体',{exact:true}).selectOption(uid(11))
  const checkbox=roster.getByRole('checkbox').first();await checkbox.check()
  await page.getByRole('button',{name:'出番表の登録',exact:false}).first().click()
  assert.equal(await roster.isVisible(),false)
  await entries.getByLabel('馬の所属団体',{exact:true}).selectOption(org.id)
  await entries.getByLabel('所属馬を選択して入力欄を追加',{exact:true}).selectOption(horse.id)
  await entries.getByLabel(`${horse.name} 1行目の競技`,{exact:true}).selectOption(comp.id)
  await entries.getByLabel(`${horse.name} 1行目の選手`,{exact:true}).selectOption(rider.id)
  await entries.getByLabel(`${horse.name} 1行目の会員区分`,{exact:true}).selectOption('member')
  await page.getByRole('button',{name:'人馬の登録',exact:false}).first().click()
  assert.equal(await checkbox.isChecked(),true,'Unsaved participant check survives switching')
  await roster.getByRole('button',{name:'次へ：出番表の登録',exact:true}).click()
  assert.equal(await entries.getByLabel(`${horse.name} 1行目の選手`,{exact:true}).inputValue(),rider.id)
  await entries.getByRole('button',{name:'全ての馬の登録内容を確認',exact:true}).click()
  await entries.getByRole('button',{name:'この一覧を仮出番表に登録する',exact:true}).waitFor()
  await entries.getByRole('button',{name:'登録した出番表を確認',exact:true}).click()
  await page.getByRole('button',{name:'この日の出番表を印刷',exact:true}).waitFor()
  assert.equal(await page.getByRole('link',{name:'CSV・TSVの取込準備を開く',exact:true}).isVisible(),false)
  assert.equal(await page.locator('#winter-panel-startlist #winter-initial-registration').count(),0)
  await page.getByRole('tab',{name:'事前登録',exact:true}).click()
  await entries.getByRole('button',{name:'この一覧を仮出番表に登録する',exact:true}).waitFor()
  assert.ok((await entries.textContent()).includes(rider.name),'Review survives other admin tab')
  await page.getByRole('tab',{name:'申請一覧',exact:true}).click()
  assert.equal(await page.getByRole('link',{name:'CSV・TSVの取込準備を開く',exact:true}).isVisible(),false)
  assert.equal(await page.getByText('締切前の準備を確認',{exact:true}).count(),0)
  await page.getByRole('tab',{name:'事前登録',exact:true}).click()
  await page.getByRole('button',{name:'人馬の登録',exact:false}).first().click()
  assert.equal(await checkbox.isChecked(),true)
  if(process.env.FHS_TEST_SCREENSHOT)await page.screenshot({path:process.env.FHS_TEST_SCREENSHOT,fullPage:true})
  await page.getByRole('link',{name:'CSV・TSVの取込準備を開く',exact:true}).click()
  await page.getByRole('link',{name:'事前登録に戻る',exact:true}).click()
  await page.getByRole('tab',{name:'事前登録',exact:true,selected:true}).waitFor()
  await page.goto(base+'/winter/admin#winter-initial-registration')
  await entries.getByLabel('馬の所属団体',{exact:true}).waitFor()
  assert.equal(await roster.isVisible(),false,'Entry deep link opens entry registration')
  // A fresh context receives no session; no live authentication is attempted.
  const signedOut=await browser.newContext({serviceWorkers:'block'})
  await signedOut.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin&&!new URL(route.request().url()).pathname.startsWith('/api/')?route.continue():route.abort())
  await signedOut.routeWebSocket('**/*',socket=>socket.close())
  const login=await signedOut.newPage();await login.goto(base+'/winter/admin#winter-admin-tools')
  await login.getByRole('heading',{name:'本部ログイン',exact:true}).waitFor()
  assert.equal(await login.getByRole('tab',{name:'事前登録',exact:true}).count(),0)
  assert.equal(writes.length,0,'Navigation, editing and review must not write')
  assert.deepEqual(apiErrors,[]);assert.deepEqual(errors,[]);assert.ok(remote.length>0)
  console.log('PASS: preregistration entry points, participant/entry/review draft retention, start-list separation, import return/deep links, signed-out guard; mock HTTP only, zero writes')
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})

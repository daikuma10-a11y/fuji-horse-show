const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const config = require('../config/winter-2026-preparation.json')
const event_id = config.eventId
const organizations = [], riders = [], horses = [], submissions = []
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const competitions = config.competitions.map((row, i) => ({ event_id, id:uid(i+100), competition_no:row.number, competition_date:row.date, name:row.name, official:row.official, fee:row.fee, op_fee:row.opFee, member_fee:row.memberFee, nonmember_fee:row.nonmemberFee }))
;(async () => {
  const browser = await chromium.launch({ headless:true })
  const page = await browser.newPage({ viewport:{ width:820, height:1180 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  let failedOnce = false
  await page.route('https://mhgyhyxagkkwdiepifdp.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1)
    const reply = (data, status = 200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(data) })
    if (url.pathname.includes('/auth/')) return reply(name === 'token' ? { access_token:'test-admin', refresh_token:'test-refresh', expires_in:3600, user:{ email:'test@example.test', app_metadata:{role:'admin'} } } : { email:'test@example.test', app_metadata:{role:'admin'} })
    if (name === 'register_winter_reception_master') {
      const body = req.postDataJSON(), id = uid(organizations.length+riders.length+horses.length+1)
      const row = { event_id, id, name:body.p_name, organization_id:body.p_organization_id, jef_member_no:null, jef_registration_no:null }
      ;(body.p_kind === 'organization' ? organizations : body.p_kind === 'rider' ? riders : horses).push(row)
      return reply(id)
    }
    if (name === 'submit_winter_reception_add') {
      const body = req.postDataJSON(); submissions.push(body)
      assert.equal(body.p_membership,'member')
      if (!failedOnce) { failedOnce = true; return reply({message:'通信テスト：同じ内容で再試行してください'},503) }
      assert.equal(body.p_id, submissions[0].p_id, 'retry must retain submission ID')
      return reply(body.p_id)
    }
    assert.equal(url.searchParams.get('event_id'),`eq.${event_id}`,`Winter page queried other event: ${url}`)
    return reply(({organizations,riders,horses,competitions,reception_entries:[]})[name] ?? [])
  })
  await page.goto(`${process.env.FHS_TEST_BASE_URL || 'http://127.0.0.1:3201'}/winter`)
  await page.getByText('団体・人馬は未登録です。', { exact:false }).waitFor()
  await page.getByLabel('メールアドレス',{exact:true}).fill('test@example.test')
  await page.getByLabel('パスワード',{exact:true}).fill('test-password')
  await page.getByRole('button',{name:'本部ログイン',exact:true}).click()
  await page.getByText('団体・選手・馬を登録（本部用）',{exact:true}).click()
  const register = async (kind, name) => {
    await page.getByLabel('登録するもの',{exact:true}).selectOption(kind)
    if (kind !== 'organization') await page.getByLabel('所属団体',{exact:true}).selectOption(organizations[0].id)
    await page.getByLabel('名前',{exact:true}).fill(name)
    await page.getByRole('button',{name:'登録する',exact:true}).click()
    await page.getByText(`${name} を登録しました`,{exact:true}).waitFor()
  }
  await register('organization','テスト団体')
  await register('rider','テスト選手')
  await register('horse','テスト馬')
  await page.getByLabel('団体',{exact:true}).selectOption(organizations[0].id)
  await page.getByLabel('競技',{exact:true}).selectOption(competitions.find(row=>row.competition_no==='5').id)
  await page.getByLabel('選手',{exact:true}).selectOption(riders[0].id)
  await page.getByLabel('馬',{exact:true}).selectOption(horses[0].id)
  await page.getByLabel('受付担当者名',{exact:true}).fill('テスト確認者')
  await page.getByRole('button',{name:'内容を確認',exact:true}).click()
  await page.getByRole('alert').getByText('会員・非会員の料金区分を選択してください').waitFor()
  await page.getByLabel('料金区分',{exact:true}).selectOption('member')
  await page.getByRole('button',{name:'内容を確認',exact:true}).click()
  await page.getByText('合計：¥8,000',{exact:false}).waitFor()
  await page.getByRole('button',{name:'追加申請を保存',exact:true}).click()
  await page.getByRole('alert').getByText('通信テスト：同じ内容で再試行してください').waitFor()
  await page.getByRole('button',{name:'追加申請を保存',exact:true}).click()
  await page.getByText('追加申請を保存しました',{exact:true}).waitFor()
  assert.equal(submissions.length,2)
  assert.deepEqual(errors,[])
  await page.screenshot({path:'/tmp/winter-screen.png',fullPage:true})
  await browser.close()
  console.log('PASS: tablet screen, Winter isolation, admin login, organization/rider/horse registration, fee category validation, review, retry ID retention and receipt display (mock API)')
})().catch(error => { console.error(error); process.exit(1) })

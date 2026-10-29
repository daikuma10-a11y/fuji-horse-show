require('./register-ts.cjs')
const assert = require('node:assert/strict')
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server')
const {WINTER_EVENT_ID:eventId} = require('../lib/winter-event.ts')
const {winterUnsettledRows} = require('../lib/winter-stable-reports.ts')
const {bookletRows,bookletPrintHtml,unsettledPrintHtml} = require('../lib/master/stable-reports.ts')
const {MasterStableReports} = require('../components/master/stable-reports.tsx')
const data={eventId,organizations:[{id:'o',name:'団体<script>x</script>',event_id:eventId},{id:'empty',name:'未参加団体',event_id:eventId}],riders:[{id:'r',name:'選手',organization_id:'o',event_id:eventId}],horses:[{id:'h',name:'馬',organization_id:'o',event_id:eventId}],competitions:[{id:'c',name:'競技',competition_no:'1',event_id:eventId}],entries:[{entry_id:'i',rider_id:'r',horse_id:'h',competition_id:'c',event_id:eventId}],timetable:[]}
const initial={id:'i',event_id:eventId,entry_fee:6000,inputs:{organizationId:'o',competitionId:'c',riderId:'r',horseId:'h'}}
const advance={event_id:eventId,organization_key:'o',paid_amount:10000,note:'確認済み',updated_at:'2026-10-29',updated_by:'admin'}
const ledger={initial:[initial],requests:[],advances:[advance],payments:[],adjustments:[],onsite:[]}
const before=JSON.stringify([data,ledger])
assert.equal(winterUnsettledRows(data,ledger)[0].amount,10000,'Use 6000 entry + 14000 horse - 10000 paid')
assert.equal(winterUnsettledRows(data,ledger).length,1,'No empty roster-only club')
assert.deepEqual(winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:20000}]}),[],'Fully paid club drops out')
const unpaid=winterUnsettledRows(data,{...ledger,advances:[]})
assert.equal(unpaid[0].amount,20000);assert.equal(unpaid[0].review,true);assert.match(unpaid[0].notes,/未確認/)
const plan={event_id:eventId,organization_key:'o',payment_method:'bank_transfer',bank_details:'振込先'}
assert.equal(winterUnsettledRows(data,{...ledger,instructions:[plan]})[0].amount,10000,'Choosing bank transfer does not count as payment')
const payment={id:'p',event_id:eventId,organization_key:'o',amount:3000,payment_method:'cash_at_venue',note:'入金確認',reverses_id:null}
assert.equal(winterUnsettledRows(data,{...ledger,payments:[payment]})[0].amount,7000)
assert.equal(winterUnsettledRows(data,{...ledger,payments:[payment,{...payment,id:'reverse',reverses_id:'p'}]})[0].amount,10000,'Reversed payment remains unpaid')
const adjustment={id:'a',sequence:1,event_id:eventId,organization_key:'o',delta:-1000,reason:'訂正',previous_id:null,before_total:20000,after_total:19000}
assert.equal(winterUnsettledRows(data,{...ledger,adjustments:[adjustment]})[0].amount,9000)
const unknown=winterUnsettledRows({...data,entries:[{...data.entries[0],entry_id:'unknown'}]},ledger)
assert.equal(unknown[0].amount,null);assert.match(unknown[0].notes,/料金履歴/)
const refund=winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:21000}]})
assert.equal(refund[0].amount,null);assert.match(refund[0].notes,/返金.*1,000円/)
const pending={id:'pending',event_id:eventId,organization_id:'o',status:'pending'}
assert.equal(winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:20000}],requests:[pending]})[0].amount,0,'Zero balance does not hide an unreflected request')
assert.throws(()=>winterUnsettledRows({...data,eventId:'autumn'},ledger),/Winter/)
assert.throws(()=>winterUnsettledRows(data,{...ledger,advances:[{...advance,event_id:'autumn'}]}),/Winter/)
assert.equal(JSON.stringify([data,ledger]),before,'Reports never mutate registration or payments')
const booklets=bookletRows([{id:'o',name:'団体<script>x</script>',horses:[{id:'h1',name:'馬'},{id:'h2',name:'馬'}]}])
assert.equal(booklets[0].count,2);assert.equal(booklets[0].arrival,'');assert.equal(booklets[0].received,'')
const html=bookletPrintHtml(booklets,'Winter','2026/10/29 12:00')
assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('合計 2頭'))
for(const label of ['手帳受取日','入厩日時','退厩日時','手帳返却日','備考'])assert.ok(html.includes(label))
const uh=unsettledPrintHtml(unpaid,'Winter','2026/10/29 12:00')
assert.ok(uh.includes('20,000円'));assert.ok(uh.includes('要確認'));assert.ok(uh.includes('size:A4 portrait'))
assert.ok(unsettledPrintHtml([],'Winter','現在').includes('未精算・要確認の団体はありません'))
const props={booklets,unsettled:unpaid,loading:false,error:'',unsettledLoading:false,unsettledError:'',loadBookletPrint:async()=>html,loadUnsettledPrint:async()=>uh}
const view=renderToStaticMarkup(React.createElement(MasterStableReports,props));assert.ok(view.includes('手帳チェックを印刷'));assert.ok(view.includes('未精算リストを印刷'))
const failed=renderToStaticMarkup(React.createElement(MasterStableReports,{...props,unsettledError:'精算を取得できません'}))
assert.ok(failed.includes('role="alert"'));assert.ok(!failed.includes('20,000円'));assert.match(failed,/<button[^>]*disabled[^>]*>未精算リストを印刷/)
console.log('PASS: booklet counts, empty date fields, payment/adjustment/reversal parity, pending/unknown/refund warnings, settled exclusion, event isolation, escaped printable tables, failed-load guards, no mutations')

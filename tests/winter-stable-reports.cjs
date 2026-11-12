require('./register-ts.cjs')
const assert = require('node:assert/strict')
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server')
const {WINTER_EVENT_ID:eventId} = require('../lib/winter-event.ts')
const {winterUnsettledRows} = require('../lib/winter-stable-reports.ts')
const {bookletRows,bookletPrintHtml,unsettledPrintHtml} = require('../lib/master/stable-reports.ts')
const {emptyStableSchedule} = require('../lib/master/stable-schedule.ts')
const {emptyFollowup,readFollowup,writeFollowup} = require('../lib/master/unsettled-followup.ts')
const {MasterStableReports} = require('../components/master/stable-reports.tsx')
const data={eventId,organizations:[{id:'o',name:'団体<script>x</script>',event_id:eventId},{id:'empty',name:'未参加団体',event_id:eventId}],riders:[{id:'r',name:'選手',organization_id:'o',event_id:eventId}],horses:[{id:'h',name:'馬',organization_id:'o',event_id:eventId}],competitions:[{id:'c',name:'競技',competition_no:'1',event_id:eventId}],entries:[{entry_id:'i',rider_id:'r',horse_id:'h',competition_id:'c',event_id:eventId}],timetable:[]}
const initial={id:'i',event_id:eventId,entry_fee:6000,inputs:{organizationId:'o',competitionId:'c',riderId:'r',horseId:'h'}}
const advance={event_id:eventId,organization_key:'o',paid_amount:10000,note:'確認済み',updated_at:'2026-10-29',updated_by:'admin'}
const ledger={initial:[initial],requests:[],advances:[advance],payments:[],adjustments:[],onsite:[]}
const before=JSON.stringify([data,ledger])
assert.equal(winterUnsettledRows(data,ledger)[0].amount,10000,'Use 6000 entry + 14000 horse - 10000 paid')
assert.equal(winterUnsettledRows(data,ledger).length,1,'No empty roster-only club')
const paidRows=winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:20000}]})
assert.deepEqual(paidRows,[],'A fully paid club drops off the list')
assert.equal(winterUnsettledRows(data,ledger)[0].status,'入金不足')
const unpaid=winterUnsettledRows(data,{...ledger,advances:[]})
assert.equal(unpaid[0].status,'未入金');assert.equal(unpaid[0].amount,20000);assert.equal(unpaid[0].review,true);assert.equal(unpaid[0].notes,undefined)
const plan={event_id:eventId,organization_key:'o',payment_method:'bank_transfer',bank_details:'振込先'}
assert.equal(winterUnsettledRows(data,{...ledger,instructions:[plan]})[0].amount,10000,'Choosing bank transfer does not count as payment')
const payment={id:'p',event_id:eventId,organization_key:'o',amount:3000,payment_method:'cash_at_venue',note:'入金確認',reverses_id:null}
assert.equal(winterUnsettledRows(data,{...ledger,payments:[payment]})[0].amount,7000)
assert.equal(winterUnsettledRows(data,{...ledger,payments:[payment,{...payment,id:'reverse',reverses_id:'p'}]})[0].amount,10000,'Reversed payment remains unpaid')
const adjustment={id:'a',sequence:1,event_id:eventId,organization_key:'o',delta:-1000,reason:'訂正',previous_id:null,before_total:20000,after_total:19000}
assert.equal(winterUnsettledRows(data,{...ledger,adjustments:[adjustment]})[0].amount,9000)
const unknown=winterUnsettledRows({...data,entries:[{...data.entries[0],entry_id:'unknown'}]},ledger)
assert.equal(unknown[0].status,'未精算');assert.equal(unknown[0].review,true);assert.equal(unknown[0].amount,null);assert.equal(unknown[0].notes,undefined)
const refund=winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:21000}]})
assert.equal(refund[0].status,'過入金');assert.equal(refund[0].amount,1000);assert.equal(refund[0].notes,undefined)
const pending={id:'pending',event_id:eventId,organization_id:'o',status:'pending'}
const pendingRows=winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:20000}],requests:[pending]})
assert.deepEqual(pendingRows.map(r=>[r.status,r.amount,r.review]),[['未精算',null,true]])
;assert.equal(pendingRows[0].notes,undefined)
const lastPayment={...payment,amount:10000}
assert.deepEqual(winterUnsettledRows(data,{...ledger,payments:[lastPayment]}),[])
const reversed=winterUnsettledRows(data,{...ledger,payments:[lastPayment,{...lastPayment,id:'reverse',reverses_id:'p'}]})
assert.deepEqual(reversed.map(r=>[r.status,r.amount]),[['入金不足',10000]])
const cleared=winterUnsettledRows(data,{...ledger,advances:[],adjustments:[{...adjustment,delta:-20000,after_total:0}]})
assert.deepEqual(cleared,[],'No charge remains, even with historical adjustments or an advance warning')
assert.throws(()=>winterUnsettledRows({...data,eventId:'autumn'},ledger),/Winter/)
assert.throws(()=>winterUnsettledRows(data,{...ledger,advances:[{...advance,event_id:'autumn'}]}),/Winter/)
assert.equal(JSON.stringify([data,ledger]),before,'Reports never mutate registration or payments')
const arrivalNote='入退厩画面専用の連絡事項'
const schedule={...emptyStableSchedule(),notes:arrivalNote}
const booklets=bookletRows([{id:'o',name:'団体<script>x</script>',horses:[{id:'h1',name:'馬'},{id:'h2',name:'馬'}]}],[{id:'o',value:schedule}])
assert.equal(booklets[0].notes,'')
assert.equal(schedule.notes,arrivalNote)
assert.equal(booklets[0].count,2);assert.equal(booklets[0].arrival,'');assert.equal(booklets[0].received,'')
const groups=['unknown','next-day','no-time','morning','afternoon','same-time'].map(id=>({id,name:id,horses:[]}))
const arrival=(id,date,time)=>({id,value:{...emptyStableSchedule(),arrivalDate:date,arrivalTime:time}})
const sorted=bookletRows(groups,[
 arrival('next-day','2026-11-14','07:00'),arrival('no-time','2026-11-13',''),
 arrival('afternoon','2026-11-13','13:00'),arrival('same-time','2026-11-13','08:30'),arrival('morning','2026-11-13','08:30'),
])
assert.deepEqual(sorted.map(row=>row.id),['morning','same-time','afternoon','no-time','next-day','unknown'])
assert.equal(groups[0].id,'unknown','sorting the booklet preserves the supplied roster order')
const html=bookletPrintHtml(booklets,'Winter','2026/10/29 12:00')
assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('合計 2頭'))
assert.match(html, /class="booklet-name" data-fit-size="10"><span>団体&lt;script&gt;x&lt;\/script&gt;<\/span>/)
for(const label of ['手帳受取日','入厩日時','退厩日時','手帳返却日','備考'])assert.ok(html.includes(label))
assert.ok(!html.includes(arrivalNote));assert.match(html,/<td><\/td><\/tr>/)
const uh=unsettledPrintHtml(unpaid,'Winter','2026/10/29 12:00')
const savedNotes=new Map()
const storage={getItem:key=>savedNotes.get(key)??null,setItem:(key,value)=>savedNotes.set(key,value),removeItem:key=>savedNotes.delete(key)}
const followup={reason:'確認用 <差額>\n再確認予定',contact:'連絡済み'}
writeFollowup(storage,'winter','o',emptyFollowup,followup)
assert.deepEqual(readFollowup(storage,'winter','o'),followup)
assert.deepEqual(readFollowup(storage,'other-event','o'),emptyFollowup)
assert.deepEqual(readFollowup(storage,'winter','other-club'),emptyFollowup)
assert.throws(()=>writeFollowup(storage,'winter','o',emptyFollowup,{...followup,reason:'同時編集'}),/別の画面/)
const printed=unsettledPrintHtml(unpaid,'Winter','現在',new Map([['o',readFollowup(storage,'winter','o')]]))
assert.ok(printed.includes('確認用 &lt;差額&gt;\n再確認予定') && printed.includes('連絡状況：連絡済み') && !printed.includes('事前入金は未確認'))
writeFollowup(storage,'winter','o',followup,emptyFollowup)
assert.equal(savedNotes.size,0)
assert.ok(!html.includes('保存済みの申込内容から自動反映'));assert.ok(!uh.includes('未反映の申請や料金履歴の不足は備考で確認できます'));assert.ok(html.includes('色付きボールペン'))
assert.ok(uh.includes('理由・備考') && uh.includes('未連絡') && uh.includes('連絡済み'));assert.ok(uh.includes('20,000円'));assert.ok(uh.includes('要確認'));assert.ok(uh.includes('size:A4 portrait'))
const emptyMessage='未精算・過入金・入金不足の団体はありません。'
const emptyPrint=unsettledPrintHtml(paidRows,'Winter','現在')
assert.ok(emptyPrint.includes(emptyMessage));assert.ok(!emptyPrint.includes('&lt;script&gt;'))
const props={booklets,unsettled:unpaid,loading:false,error:'',unsettledLoading:false,unsettledError:'',loadBookletPrint:async()=>html,loadUnsettledPrint:async()=>uh}
const view=renderToStaticMarkup(React.createElement(MasterStableReports,props));assert.ok(view.includes('手帳チェックを印刷'));assert.ok(view.includes('未精算リストを印刷'))
assert.ok(!view.includes(arrivalNote))
const emptyView=renderToStaticMarkup(React.createElement(MasterStableReports,{...props,booklets:[],unsettled:paidRows}))
assert.ok(emptyView.includes(emptyMessage));assert.ok(!emptyView.includes('&lt;script&gt;'))
for(const rows of [unpaid,refund,unknown,pendingRows,winterUnsettledRows(data,ledger)]){
 const label=rows[0].status
 assert.ok(unsettledPrintHtml(rows,'Winter','現在').includes('>'+label+'<'))
 assert.ok(renderToStaticMarkup(React.createElement(MasterStableReports,{...props,unsettled:rows})).includes('>'+label+'<'))
}
const mixed=winterUnsettledRows(data,{...ledger,advances:[{...advance,paid_amount:20000},{...advance,organization_key:'empty',paid_amount:1000}]})
assert.deepEqual(mixed.map(r=>[r.id,r.status,r.amount]),[['empty','過入金',1000]])
const mixedView=renderToStaticMarkup(React.createElement(MasterStableReports,{...props,booklets:[],unsettled:mixed}))
const mixedPrint=unsettledPrintHtml(mixed,'Winter','現在')
for(const output of [mixedView,mixedPrint]){
 assert.ok(output.includes('未参加団体') && output.includes('1,000円'))
 assert.ok(!output.includes('&lt;script&gt;'))
}
const failed=renderToStaticMarkup(React.createElement(MasterStableReports,{...props,unsettledError:'精算を取得できません'}))
assert.ok(failed.includes('role="alert"'));assert.ok(!failed.includes('20,000円'));assert.match(failed,/<button[^>]*disabled[^>]*>未精算リストを印刷/)
console.log('PASS: booklet counts, empty date fields, payment/adjustment/reversal parity, pending/unknown/refund warnings, settled exclusion, event isolation, escaped printable tables, failed-load guards, no mutations')

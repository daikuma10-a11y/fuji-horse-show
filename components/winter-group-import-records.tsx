'use client'
import {useEffect,useState} from 'react'
import {parseApplicationRegistration,type ApplicationRegistration} from '@/lib/winter-application-registration'
import {importBindingKey} from '@/lib/winter-import-registration'
import {winterStorageKey} from '@/lib/winter-event'

export function WinterGroupImportRecords({orgId}:{orgId:string}){
 const [records,setRecords]=useState<ApplicationRegistration[]>([]),[warning,setWarning]=useState('')
 useEffect(()=>{
   const found:ApplicationRegistration[]=[]
   try{
     const prefix=winterStorageKey('application-registration')+':'
     for(let i=0;i<localStorage.length;i++){
       const key=localStorage.key(i)
       if(!key?.startsWith(prefix))continue
       try{
         const record=parseApplicationRegistration(localStorage.getItem(key)??'')
         if(record.entries?.bindings[importBindingKey('団体','ORG')]===orgId)found.push(record)
       }catch{setWarning('この端末に読み取れない取込記録があります。')}
     }
   }catch{setWarning('この端末の取込記録を開けません。')}
   setRecords(found)
 },[orgId])
 return <section className="space-y-3"><h3 className="text-xl font-bold">Excelの取込記録（この端末）</h3>
   {warning&&<p role="alert">{warning}</p>}
   {!records.length&&<p>この端末には、この団体に対応する取込記録がありません。大会に保存された内容は団体画面で確認できます。</p>}
   {records.map(({review,entries})=><details key={review.reference} className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">{review.original.fileName}</summary>
     <p>申込書合計 {review.original.amounts.total||'記載なし'} ／ 取込時の入金確認額 {review.accountChecked?Number(review.paid).toLocaleString('ja-JP')+'円':'未確認'}</p>
     <p>取込時の記録です。現在の請求・入金は「入金情報」で確認してください。</p>
     <p>登録確認済みの出番 {Object.values(entries?.states??{}).filter(s=>s==='registered').length}件</p>
     <p>馬匹登録料 {review.original.amounts.horse||'—'} ／ 障害 {review.original.amounts.jump||'—'} ／ 馬場 {review.original.amounts.dressage||'—'}</p>
     <ul className="list-disc pl-5">{review.edited.people.map(p=><li key={p.key}>{p.kind==='horse'?'馬':'選手'}　{p.name}　{p.reading}　{p.jef||'番号なし'}　{p.kind==='horse'?p.horseGrade:p.grade}</li>)}</ul>
     <details><summary>取込時の出番（{review.edited.entries.length}件）</summary>
       <ul>{review.edited.entries.map(e=><li key={e.key}>第{e.competition}競技　{review.edited.people.find(p=>p.key===e.rider)?.name} ／ {review.edited.people.find(p=>p.key===e.horse)?.name}{e.op?'（OP）':''}</li>)}</ul>
     </details>
   </details>)}
 </section>
}

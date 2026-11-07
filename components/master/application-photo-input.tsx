'use client'
import {useState} from 'react'
import type {Application} from '@/lib/master/application'
import {PHOTO_MAX_PAGES,photoReviewComplete,type ApplicationPhotoPage} from '@/lib/master/application-photo'
const button='min-h-12 rounded-xl border-2 border-blue-800 bg-white px-4 py-3 text-base font-bold text-blue-900 disabled:opacity-40'
export function MasterApplicationPhotoInput({busy,hasDraft,onRead}:{busy:boolean;hasDraft:boolean;onRead:(files:File[])=>void}){
 const [files,setFiles]=useState<File[]>([]),[error,setError]=useState('')
 return <details className="rounded-xl border-2 border-blue-300 p-4"><summary className="cursor-pointer text-xl font-bold">手書きの申込書を写真から読み込む</summary><div className="mt-4 space-y-3">
  <p>同じ団体の申込書を、名簿・出番・集計の全ページがそろうように1〜6枚選んでください。写真は真上から、文字が読める明るさで撮影します。</p>
  <p>オンラインでAIが読み取ります。押すと写真を読み取りサービス（Vercel AI Gateway経由）へ送信します。結果を確認・訂正してから登録します。読み取りだけでは大会データを変更しません。</p>
  {hasDraft&&<p className="rounded-lg bg-amber-50 p-3">確認中の申込書を保持しています。別の申込書は確認途中を保存して「次の申込書へ」から開いてください。同じ写真は再表示できます。</p>}
  <label className={button+' block cursor-pointer'}>写真を選ぶ・追加する<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={busy} className="mt-2 block max-w-full font-normal" onChange={e=>{const incoming=Array.from(e.target.files??[]);e.target.value='';if(incoming.length+files.length>PHOTO_MAX_PAGES){setError('写真は合計6枚までです');return}setFiles(v=>[...v,...incoming]);setError('')}}/></label>
  {files.map((file,i)=><div key={`${i}-${file.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"><span>{i+1}枚目：{file.name}</span><button type="button" className={button} disabled={busy} onClick={()=>setFiles(v=>v.filter((_,n)=>n!==i))}>選択から外す</button></div>)}
  {error&&<p role="alert">{error}</p>}
  <button type="button" disabled={busy||!files.length} className={button+' bg-blue-800 !text-white'} onClick={()=>onRead(files)}>{busy?'写真を確認・読み取り中…':'選んだ写真を読み込む'}</button>
 </div></details>
}
export function MasterApplicationPhotoReview({app,pages,busy,onConfirm,onStallRequest}:{app:Application;pages:ApplicationPhotoPage[];busy:boolean;onConfirm:(checked:boolean)=>void;onStallRequest:(value:string)=>void}){
 const [index,setIndex]=useState(0),source=app.photo
 if(!source)return null
 const page=source.pages[Math.min(index,source.pages.length-1)],image=pages.find(p=>p.digest===page.digest)
 const allPresent=source.pages.every(p=>pages.some(x=>x.digest===p.digest))
 return <section id="application-photo-review" tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4"><h4 className="text-xl font-bold">写真の原本と読み取り結果を確認</h4>
  <p>読み取った大会名：{source.eventName||'判読できません'} ／ 選手{app.people.filter(p=>p.kind==='rider').length}名・馬{app.people.filter(p=>p.kind==='horse').length}頭・出番{app.entries.length}件</p>
  <p>氏名・馬名・番号・競技・OP・金額・要望の誤読や抜けを、下の確認欄で訂正してください。写真はこの端末に保存します。別の端末で確認再開JSONを開いた場合は、元の写真を選び直して表示します。</p>
  <div className="flex flex-wrap gap-2">{source.pages.map((p,i)=><button type="button" key={p.digest} aria-pressed={index===i} className={button} onClick={()=>setIndex(i)}>{i+1}枚目</button>)}</div>
  {image?<details open><summary className="cursor-pointer font-bold">{page.name}を表示</summary><div className="max-h-[65vh] overflow-auto rounded border bg-white"><img src={image.dataUrl} alt={`${index+1}枚目の申込書原本`} className="h-auto min-w-full max-w-none"/></div></details>:<p role="status">この端末に原本写真がありません。上の写真欄から同じ写真を選び直してください。</p>}
  {!!source.warnings.length&&<div className="rounded-lg border border-amber-700 bg-white p-3"><strong>要確認</strong><ul className="list-disc space-y-1 pl-5">{source.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
  <label className="block font-bold">馬房要望の読み取り結果（誤読を訂正）<textarea disabled={busy} maxLength={4000} className="mt-2 min-h-24 w-full rounded border-2 border-slate-400 bg-white p-3 font-normal" value={app.stallRequest??''} onChange={e=>onStallRequest(e.target.value)}/></label>
  <label className="flex items-start gap-3 rounded-lg border-2 bg-white p-3 font-bold"><input type="checkbox" className="mt-1 h-5 w-5" disabled={busy||!allPresent} checked={photoReviewComplete(app)} onChange={e=>onConfirm(e.target.checked)}/>全ページを見比べ、2026 Winter・同じ団体の申込書であること、要確認箇所と入力漏れを確認・訂正しました</label>
  <p className="text-sm">内容を訂正すると、この確認は外れます。最後にもう一度確認してください。</p>
 </section>
}

"use client"

import Link from 'next/link'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { WINTER_EVENT_ID, WINTER_EVENT_NAME } from '@/lib/winter-event'
import { IMPORT_HEADERS, IMPORT_SAMPLE, readImportDraft, reviewWinterImport, type ImportSource } from '@/lib/winter-import-review'

const empty:ImportSource={roster:'',entries:'',accounts:''}
const titles:Record<keyof ImportSource,string>={roster:'人馬名簿',entries:'正式出番表',accounts:'事前申込・入金状況'}
const button='min-h-14 rounded-xl border-2 border-blue-800 px-5 py-3 text-xl font-bold disabled:opacity-40'
function download(text:string,name:string,type:string) {
  const url=URL.createObjectURL(new Blob([text],{type})),anchor=document.createElement('a')
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export default function Page() {
  const [source,setSource]=useState<ImportSource>(empty),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[sample,setSample]=useState(false),[busy,setBusy]=useState(false)
  const lock=useRef(false),revision=useRef(0)
  const report=useMemo(()=>reviewWinterImport(source),[source])
  function replace(next:ImportSource,isSample=false){revision.current++;setSource(next);setSample(isSample);setConfirmed(isSample);setMessage('')}
  function edit(kind:keyof ImportSource,text:string){revision.current++;setSource(value=>({...value,[kind]:text}));setConfirmed(false);setSample(false);setMessage('')}
  async function file(event:ChangeEvent<HTMLInputElement>,kind:keyof ImportSource|'draft') {
    const selected=event.target.files?.[0];event.target.value='';if(!selected||lock.current)return
    lock.current=true;setBusy(true);setMessage('');const generation=revision.current
    try {
      if(selected.size>8_000_000)throw new Error('8MB以内の資料を選んでください')
      const text=new TextDecoder('utf-8',{fatal:true}).decode(await selected.arrayBuffer())
      if(revision.current!==generation)throw new Error('読込中に入力が変わりました。ファイルを選び直してください')
      if(kind==='draft')replace(readImportDraft(JSON.parse(text)))
      else edit(kind,text)
      setMessage(`${selected.name} を読み込みました。まだ大会データには登録していません。`)
    }catch(reason){setMessage(reason instanceof Error?reason.message:'読み込めません。Excelから直接貼り付けるかCSV UTF-8で保存してください')}
    finally{lock.current=false;setBusy(false)}
  }
  function save() {
    if(!confirmed){setMessage('Winterの資料であることを確認してください');return}
    download(JSON.stringify({kind:'winter-import-review',version:1,eventId:WINTER_EVENT_ID,createdAt:new Date().toISOString(),sample,source},null,2),'Winter-取込準備.json','application/json')
    setMessage('準備ファイルのダウンロードを開始しました。ダウンロード先で確認してください。大会への登録はまだ行っていません。')
  }
  const names=new Map(report.people.map(p=>[`${p.kind}:${p.id}`,p.name]))
  const errors=report.issues.filter(i=>i.severity==='error'),warnings=report.issues.filter(i=>i.severity==='warning')
  return <main className="mx-auto min-h-dvh max-w-6xl space-y-6 bg-slate-50 p-5 text-slate-900">
    <h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1>
    <h2 className="text-3xl font-bold">名簿・出番表・精算の読み込み準備</h2>
    <Link className={button+' inline-block'} href="/winter/admin">大会本部に戻る</Link>
    <div className="rounded-xl bg-blue-100 p-5 text-xl">締切前の確認用です。Excelの表を見出しごと貼り付けるか、雛形に合わせたCSV UTF-8を選んでください。入力資料はこの画面内で処理します。正式な登録・反映はまだ行いません。保存した準備ファイルから再開できます。</div>
    <p className="text-lg">元の申込書Excelをそのまま一括登録する機能は、実際の記入済み資料を確認してから接続します。識別番号は先頭の0を残すため、Excelでは文字列で扱ってください。団体・選手・馬はそれぞれ重複しない番号で結び付けます。</p>
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>{if(!Object.values(source).some(Boolean)||window.confirm('現在の準備内容を確認用サンプルに置き換えますか？'))replace({...IMPORT_SAMPLE},true)}}>2人馬の確認用サンプルを入れる</button><label className={button}>保存した準備ファイルを開く<input className="mt-2 block max-w-full text-base" disabled={busy} type="file" accept=".json" onChange={e=>void file(e,'draft')} /></label></div>
    {sample&&<p role="status" className="rounded-xl bg-amber-100 p-4 text-xl font-bold">確認用サンプルです。実際の参加者や請求ではありません。</p>}
    {(Object.keys(titles) as (keyof ImportSource)[]).map(kind=><section key={kind} className="space-y-3 rounded-xl border-2 bg-white p-5">
      <h3 className="text-2xl font-bold">{titles[kind]}</h3>
      <p className="break-words text-lg">見出し：{IMPORT_HEADERS[kind].join(' ／ ')}</p>
      {kind==='roster'&&<p>会員区分は「会員／非会員」、確認欄は「はい／いいえ」、騎乗者資格は「A／B／C／未登録」です。団体行は名前・番号・ふりがなのみ。所属は団体番号で指定します。</p>}
      {kind==='entries'&&<p>競技番号は①〜④・1〜36。OPは「はい／いいえ」で明示してください。選手・馬は名簿の識別番号で指定します。</p>}
      {kind==='accounts'&&<p>事前申込合計は馬匹登録料等を含む原本の総額、入金額は確認済みの実額を入力します。出番表の金額から自動置換しません。金額はカンマ・円記号なし。空欄のまま名簿の準備を進めても構いません。</p>}
      <div className="flex flex-wrap items-center gap-3"><button className={button} onClick={()=>download('\uFEFF'+IMPORT_HEADERS[kind].join(',')+'\r\n',`Winter-${kind}-雛形.csv`,'text/csv;charset=utf-8')}>CSV雛形を保存</button><label className="text-lg">CSV・タブ区切りファイル<input className="mt-2 block max-w-full" disabled={busy} type="file" accept=".csv,.tsv,.txt" onChange={e=>void file(e,kind)} /></label></div>
      <label className="block text-lg">{titles[kind]}の表を貼り付け<textarea className="mt-2 min-h-48 w-full rounded-xl border-2 p-3 text-base" value={source[kind]} maxLength={2_000_000} spellCheck={false} disabled={busy} onChange={e=>edit(kind,e.target.value)} /></label>
    </section>)}
    <label className="flex min-h-16 items-center gap-4 rounded-xl border-2 bg-white p-4 text-xl"><input className="size-7" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />この資料は2026 Winterのものです（サンプルの場合は確認用です）</label>
    <section aria-live="polite" className="space-y-4 rounded-xl border-2 bg-white p-5">
      <h3 className="text-2xl font-bold">確認結果</h3>
      <p className="text-xl">団体 {report.people.filter(p=>p.kind==='団体').length} ／ 選手 {report.people.filter(p=>p.kind==='選手').length} ／ 馬 {report.people.filter(p=>p.kind==='馬').length} ／ 出番 {report.entries.length}</p>
      <ul className="space-y-2 text-xl"><li>名簿：{confirmed&&report.rosterReady?'形式の確認済み':'未完了'}</li><li>出番表：{confirmed&&report.entriesReady?'形式・料金の確認済み':'未完了'}</li><li>事前精算：{confirmed&&report.accountsReady?'合計・入金額の入力確認済み':'未完了'}</li></ul>
      <p className="text-lg">これは入力形式の確認です。実際の名簿との同一性、馬のグレード申請、入金の事実は本部が原本で確認してください。</p>
      <p className="text-xl">出番表の競技料金小計：{report.entryFeeTotal===null?'料金区分を確認してください':`¥${report.entryFeeTotal.toLocaleString('ja-JP')}`}<br/>事前申込合計：¥{report.initialTotal.toLocaleString('ja-JP')} ／ 入金額：¥{report.paidTotal.toLocaleString('ja-JP')}</p>
      <p>出番表小計には馬匹登録料・追加手数料・その他費用を含みません。事前申込合計とは別の数字です。</p>
      <h4 className="text-xl font-bold">修正が必要 {errors.length}件 ／ 要確認 {warnings.length}件</h4>
      {report.issues.length>0&&<ul className="max-h-96 space-y-2 overflow-auto">{report.issues.slice(0,200).map((i,index)=><li key={index} className={`rounded-lg p-3 text-lg ${i.severity==='error'?'bg-red-100':'bg-amber-100'}`}>{i.section}{i.row?` ${i.row}行目`:''}：{i.message}</li>)}{report.issues.length>200&&<li>残り {report.issues.length-200}件。先に表示中の問題を修正してください。</li>}</ul>}
      {report.entries.length>0&&<div className="overflow-x-auto"><table className="w-full border-collapse text-lg"><caption className="mb-3 text-left font-bold">出番のプレビュー（先頭30件）</caption><thead><tr>{['競技','出番','選手','馬','OP','競技料金'].map(t=><th key={t} className="border p-2 text-left">{t}</th>)}</tr></thead><tbody>{report.entries.slice(0,30).map((e,index)=><tr key={index}><td className="border p-2">{e.competition}</td><td className="border p-2">{Number.isFinite(e.order)?e.order:'要確認'}</td><td className="border p-2">{names.get('選手:'+e.rider)??e.rider}</td><td className="border p-2">{names.get('馬:'+e.horse)??e.horse}</td><td className="border p-2">{e.op?'OP':'—'}</td><td className="border p-2">{e.price===null?'要確認':`¥${e.price.toLocaleString('ja-JP')}`}</td></tr>)}</tbody></table></div>}
      <button className={button+' bg-blue-800 text-white'} disabled={!confirmed||busy||!Object.values(source).some(Boolean)} onClick={save}>準備内容をファイルに保存</button>
      <p>修正途中でも保存できます。再度開くと確認をやり直します。この画面を閉じる前に保存してください。</p>
    </section>
    {message&&<p role="status" className="rounded-xl bg-blue-100 p-4 text-xl">{message}</p>}
  </main>
}

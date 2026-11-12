'use client'
import {useEffect,useRef,useState} from 'react'
import {GroupEntryFields,type EntryFields} from './master/group-entry-fields'
import {groupActionClass} from './master/group-registration-tools'
import {loadHorseOptions} from '@/lib/winter-horse-substitution'
import type {SubstitutionEntry} from '@/lib/master/horse-substitution'
import {winterCompetition,winterStorageKey} from '@/lib/winter-event'
import type {loadWinterData} from '@/lib/winter-data'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import {reviewWinterChange,type WinterChangeInput} from '@/lib/winter-change'
import {correctWinterGroupEntry,type GroupCorrectionQuote} from '@/lib/winter-group-entry-correction'
import {emptyWinterQueue,submitWinterBatch,WinterBatchRejected} from '@/lib/winter-batch'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'

type Data=Awaited<ReturnType<typeof loadWinterData>>
type Review={group:string;entry:string;before:string;after:string;lines:string[]} & (
  {kind:'request';change:WinterChangeInput}|{kind:'correction';operation:string;quote:GroupCorrectionQuote}
)
const yen=(amount:number)=>amount.toLocaleString('ja-JP')+'円'
export const entryEditKey=(email:string,group:string)=>winterStorageKey('group-entry-edit')+':'+email+':'+group

export function WinterGroupEntryEdit({entryId,group,data,session,onSession,onSaved}:{entryId:string;group:string;data:Data;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}){
  const original=data.entries.find(e=>e.entry_id===entryId)
  const from=data.competitions.find(c=>c.id===original?.competition_id)
  const key=entryEditKey(session.email,group)
  const [fields,setFields]=useState<EntryFields|null>(null),[basis,setBasis]=useState<SubstitutionEntry|null>(null)
  const [mode,setMode]=useState<''|'request'|'correction'>('')
  const [review,setReview]=useState<Review|null>(null),[attempted,setAttempted]=useState(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0)
  const lock=useRef(false),auth=useRef({session,onSession});auth.current={session,onSession}
  const horseId=original?.horse_id,riderId=original?.rider_id,competitionId=from?.id,wasOp=!!original?.is_op
  useEffect(()=>{
    let active=true
    setFields(null);setBasis(null);setReview(null);setAttempted(false)
    try{
      const raw=sessionStorage.getItem(key)
      if(raw){
        const task:Review=JSON.parse(raw)
        if(task.entry!==entryId||task.group!==group)throw Error('この団体の未確認の修正を先に開いてください。')
        setReview(task);setAttempted(true);return
      }
      if(!horseId||!riderId||!competitionId)throw Error('対象の出番が変わりました。団体の登録内容を開き直してください。')
      loadHorseOptions(auth.current.session,auth.current.onSession,horseId).then(options=>{
        if(!active)return
        const row=options.entries.find(e=>e.id===entryId)
        if(!row||row.rider!==riderId||row.competition!==competitionId||!!row.op!==wasOp||!Number.isSafeInteger(row.oldFee))throw Error('元の出番・料金区分を確認できません。最新の登録内容を確認してください。')
        setBasis(row);setFields({competition:row.competition,rider:riderId,horse:horseId,op:wasOp,membership:row.membership==='member'||row.membership==='nonmember'?row.membership:'',instructor:row.instructor})
      }).catch(e=>{if(active)setError(e.message)})
    }catch(e){setError(e instanceof Error?e.message:'端末の確認記録を開けません。')}
    return ()=>{active=false}
  },[key,entryId,group,horseId,riderId,competitionId,wasOp,reload])
  const competition=data.competitions.find(c=>c.id===fields?.competition)
  const orgName=(id:string)=>data.organizations.find(o=>o.id===id)?.name??'所属未確認'
  function describe(comp:string,rider:string,horse:string,op:boolean){
    const c=data.competitions.find(c=>c.id===comp)
    return [c&&winterCompetitionLabel(c),data.riders.find(r=>r.id===rider)?.name,data.horses.find(h=>h.id===horse)?.name,op?'OP':'通常'].join(' ／ ')
  }
  async function preview(){
    if(lock.current||!mode)return
    lock.current=true;setBusy(true);setError('')
    try{
      if(!fields||!basis||!original||!from||!competition||!data.entries.some(e=>e.entry_id===entryId))throw Error('対象の出番を再確認してください。')
      const rider=data.riders.find(r=>r.id===fields.rider),horse=data.horses.find(h=>h.id===fields.horse)
      if(!rider||!horse)throw Error('参加する選手と馬を選んでください。')
      const organization=data.organizations.find(o=>o.id===rider.organization_id)
      if(!organization)throw Error('請求先の団体を確認できません。')
      if(data.entries.some(e=>e.entry_id!==entryId&&!['wd','withdrawn'].includes(e.status.toLowerCase())&&e.competition_id===competition.id&&e.rider_id===rider.id&&e.horse_id===horse.id))throw Error('同じ競技・選手・馬の出番がすでにあります。')
      const change:WinterChangeInput={original,from,fromSelection:{membership:basis.membership==='member'||basis.membership==='nonmember'?basis.membership:undefined,isOp:!!basis.op,instructorConfirmed:basis.instructor},
        target:{id:crypto.randomUUID(),organization,rider,horse,competition,selection:{membership:fields.membership||undefined,isOp:fields.op,instructorConfirmed:fields.instructor},visitorName:'大会本部・事前登録',masterForm:true}}
      const category=(value:string|null)=>value==='member'?' ／ 会員':value==='nonmember'?' ／ 非会員':''
      const before=describe(from.id,original.rider_id,original.horse_id,!!original.is_op)+category(basis.membership)
      const after=describe(competition.id,rider.id,horse.id,fields.op)+category(fields.membership)
      if(mode==='correction'){
        const verified=await verifyAdminSession(session);onSession(verified)
        const target={...fields,membership:fields.membership||null}
        const quote=await correctWinterGroupEntry(group,entryId,target,null,null,verified.accessToken)
        const old=quote.original
        if(old.competitionId!==from.id||old.riderId!==original.rider_id||old.horseId!==original.horse_id||!!old.op!==!!original.is_op||old.fee!==basis.oldFee)throw Error('元の出番または料金が変わりました。最新の登録内容を開き直してください。')
        const lines=['転記訂正　変更料 0円','競技料　'+yen(old.fee)+' → '+yen(quote.fee),
          ...quote.accounts.map(a=>orgName(a.id)+'　請求額 '+yen(a.before)+' → '+yen(a.before+a.delta))]
        setReview({kind:'correction',group,entry:entryId,operation:change.target.id,quote,before,after,lines})
        return
      }
      const result=reviewWinterChange(change)
      if(result.fromEntryFee!==basis.oldFee)throw Error('登録時の競技料と現在の料金設定が異なります。精算で確認してください。')
      const {fee}=result
      setReview({kind:'request',group,entry:entryId,change,before,after,lines:[
        '請求先　'+organization.name,
        result.treatedAsWithdrawAdd?'棄権＋追加扱い　追加料 '+yen(fee.addBase)+' ／ 競技料 '+yen(fee.addEntry):'変更料 '+yen(fee.changeBase)+' ／ 競技料の差額 '+yen(fee.competitionDiff),
        '追加請求額　'+yen(fee.total)]})
    }catch(e){setError(e instanceof Error?e.message:'修正内容を確認してください。')}finally{lock.current=false;setBusy(false)}
  }
  async function confirm(){
    if(!review||lock.current)return
    lock.current=true;setBusy(true);setError('')
    try{
      const stored=sessionStorage.getItem(key),serialized=JSON.stringify(review)
      if(stored&&stored!==serialized)throw Error('別の修正が保存されています。先にその結果を確認してください。')
      const verified=await verifyAdminSession(session);onSession(verified)
      sessionStorage.setItem(key,serialized);setAttempted(true)
      try{
        if(review.kind==='correction'){
          await correctWinterGroupEntry(group,entryId,review.quote.target,review.operation,review.quote,verified.accessToken)
        }else await submitWinterBatch({...emptyWinterQueue(),attempted:true,items:[{type:'change',input:review.change}]},verified.accessToken,'meeting')
      }catch(e){
        if(e instanceof WinterBatchRejected||(e instanceof Error&&'status' in e&&e.status===400)){sessionStorage.removeItem(key);setAttempted(false);setReview(null);setReload(v=>v+1)}
        throw e
      }
      sessionStorage.removeItem(key);onSaved()
    }catch(e){setError(e instanceof Error?e.message:'保存結果を確認できません。同じ内容で再確認してください。')}finally{lock.current=false;setBusy(false)}
  }
  const person=(p:{id:string;name:string;organization_id:string},number:string|null)=>({id:p.id,group:{id:p.organization_id,name:data.affiliationNames?.[p.organization_id]??orgName(p.organization_id)},label:[p.name,number].filter(Boolean).join(' ／ ')})
  return <section className="space-y-3"><h4 className="text-xl font-bold">エントリーを修正</h4>
    {review?<><p>修正前　{review.before}</p><p>修正後　{review.after}</p>{review.lines.map(line=><p key={line}>{line}</p>)}
      <button type="button" className={groupActionClass} disabled={busy} onClick={()=>void confirm()}>{attempted?'同じ修正の確定結果を再確認':'この内容で確定'}</button>
      {!attempted&&<button type="button" className={groupActionClass} disabled={busy} onClick={()=>setReview(null)}>入力に戻る</button>}</>:
    fields&&competition?<fieldset disabled={busy} className="space-y-3">
      <legend>修正の種類</legend>
      <label className="block"><input type="radio" name="group-entry-mode" checked={mode==='correction'} onChange={()=>setMode('correction')}/> 申込書の転記訂正（競技料の差額のみ）</label>
      <label className="block"><input type="radio" name="group-entry-mode" checked={mode==='request'} onChange={()=>setMode('request')}/> 団体からの締切後の変更依頼（大会の変更規定を適用）</label>
      <GroupEntryFields value={fields} change={v=>{setFields(v);setError('')}} competitions={data.competitions.map(c=>({id:c.id,label:c.competition_date+'　'+winterCompetitionLabel(c)}))}
        riders={data.riders.map(p=>person(p,p.jef_member_no))} horses={data.horses.map(p=>person(p,p.jef_registration_no))}
        allowOp={!competition.official&&competition.op_fee!=null} membership={competition.member_fee!=null||competition.nonmember_fee!=null} instructor={winterCompetition(competition.competition_no).instructorRequired}/>
      <button type="button" className={groupActionClass} disabled={busy||!mode} onClick={()=>void preview()}>修正内容と料金を確認</button></fieldset>:!error&&<p>登録時の出番と料金を読み込んでいます…</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-100 p-3">{error}</p>}
    {error&&!fields&&!review&&<button type="button" className={groupActionClass} onClick={()=>setReload(n=>n+1)}>読み直す</button>}
  </section>
}

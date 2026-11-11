'use client'
import {useEffect,useRef,useState} from 'react'
import {WINTER_EVENT_ID} from '@/lib/winter-event'
import {HORSE_DECLARATIONS} from '@/lib/master/application-credentials'
import type {AdminSession} from '@/lib/supabase-rest'
import type {RegistrationOverviewPerson} from '@/lib/master/registration-overview'
import type {ApplicationSnapshot} from '@/lib/winter-application-registration'
import {winterApplicationServices} from '@/lib/winter-application-services'
import {rosterCorrectionInput,rosterCorrectionMatches} from '@/lib/winter-roster-correction'
import {RegistrationPersonFields} from './master/group-registration-tools'

export function WinterGroupPerson({person,kind,orgId,session,onSession,onSaved}:{person:RegistrationOverviewPerson;kind:'rider'|'horse';orgId:string;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}){
  const [snapshot,setSnapshot]=useState<ApplicationSnapshot|null>(null),[error,setError]=useState('')
  const [grade,setGrade]=useState(''),[gradeBusy,setGradeBusy]=useState(false),[gradeError,setGradeError]=useState('')
  const [attempt,setAttempt]=useState(0),latest=useRef(session);latest.current=session
  useEffect(()=>{
    let active=true
    setError('');setSnapshot(null)
    winterApplicationServices(latest.current,onSession).load().then(s=>{if(active)setSnapshot(s)}).catch(e=>{if(active)setError(e.message)})
    return ()=>{active=false}
  },[orgId,person.id,onSession,attempt])
  if(error)return <p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>読み直す</button></p>
  if(!snapshot)return <p role="status">保存済みの名簿を確認しています…</p>
  const binding=snapshot.bindings.find(b=>(kind==='rider'?b.rider_id:b.horse_id)===person.id)
  const entity=snapshot.roster.entities.find(e=>e.id===binding?.entity_id&&e.kind===kind)
  const target=snapshot.data[kind==='horse'?'horses':'riders'].find(e=>e.id===person.id)
  const club=snapshot.roster.clubs.find(c=>c.id===binding?.club_id)
  if(!binding||!entity||!club||target?.organization_id!==orgId)return <p role="alert">この団体の参加IDと共通名簿を照合できません。</p>
  const credential=snapshot.credentials.find(c=>c.target_id===person.id)
  async function saveGrade(){
    if(!grade||!binding||!target)return
    setGradeBusy(true);setGradeError('')
    try{
      const expected=credential?.request_id??null
      const bytes=new TextEncoder().encode(JSON.stringify([WINTER_EVENT_ID,orgId,person.id,grade,expected]))
      const requestId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
      const services=winterApplicationServices(latest.current,onSession)
      const input={eventId:WINTER_EVENT_ID,entityId:binding.entity_id,clubId:binding.club_id,targetId:target.id,kind,name:target.name,
        jef:('jef_member_no' in target?target.jef_member_no:target.jef_registration_no)??'',value:grade,requestId,expected,digest:requestId,
        reference:'団体別の登録内容',location:kind==='horse'?'馬名簿のグレード宣言':'選手名簿の所有資格級'}
      let failure:unknown
      try{await services.saveCredential(input)}catch(e){failure=e}
      const saved=(await services.load()).credentials.find(c=>c.target_id===person.id)
      if(saved?.request_id!==requestId)throw failure??Error('資格・グレードの保存を確認できません。')
      onSaved()
    }catch(e){setGradeError(e instanceof Error?e.message:'資格・グレードの保存を確認できません。')}finally{setGradeBusy(false)}
  }
  return <><RegistrationPersonFields kind={kind} person={person} reading={entity.reading} onSave={async(name,reading,jef)=>{
    const services=winterApplicationServices(latest.current,onSession)
    const input=rosterCorrectionInput({kind,name,reading,jef},entity.id,club.name,snapshot,crypto.randomUUID())
    let failed:unknown
    try{await services.correctPerson(input)}catch(e){failed=e}
    if(!rosterCorrectionMatches(input,await services.load()))throw failed??new Error('訂正後の名簿を確認できません。登録内容を読み直してください。')
    onSaved()
  }}/>
  <fieldset className="mt-4 space-y-2 rounded-lg border p-3" disabled={gradeBusy}>
    <legend className="px-2 font-bold">{kind==='rider'?'所有資格級':'グレード宣言'}</legend>
    <p>現在の表示　{person.credential?.value??'未確認'}</p>
    <label>申込書で確認した内容<select className="ml-2 rounded border p-2" value={grade} onChange={e=>setGrade(e.target.value)}>
      <option value="">選択</option>{(kind==='horse'?HORSE_DECLARATIONS:['A','B','C','未登録']).map(g=><option key={g} value={g}>{g}</option>)}</select></label>
    <button className="ml-2 rounded border p-2 font-bold" disabled={!grade} onClick={()=>void saveGrade()}>資格・グレードを保存</button>
    {gradeError&&<p role="alert">{gradeError}</p>}
  </fieldset></>
}

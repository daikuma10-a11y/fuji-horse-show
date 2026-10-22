"use client"
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import Link from 'next/link'
import {ArrowLeft,LogIn,LogOut} from 'lucide-react'
import {AppHeader} from '@/components/app-header'
import {signInAdmin,verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {loadWinterData} from '@/lib/winter-data'
import {WINTER_EVENT_NAME,winterStorageKey} from '@/lib/winter-event'
import {SharedRosterManager} from '@/components/shared-roster-manager'
import {WinterMasterRegistration} from '@/components/winter-master-registration'
import {WinterMeetingPanel} from '@/components/winter-meeting-panel'
import {WinterExportPanel} from '@/components/winter-export-panel'
import {subscribeWinterUpdates} from '@/lib/winter-live'
import {WinterSettlementActions} from '@/components/winter-settlement-actions'
import {WinterInitialEntryRegistration} from '@/components/winter-initial-entry-registration'
import {WinterStartList} from '@/components/winter-start-list'
import {WinterTimetable} from '@/components/winter-timetable'
import {WinterSettlementPanel} from '@/components/winter-settlement-panel'
import {WinterRequestPanel} from '@/components/winter-request-panel'
import {WinterAdminNavigation,winterAdminTabs,type WinterAdminTab} from '@/components/winter-admin-navigation'
import {MasterPreRegistration,type PreRegistrationSection} from '@/components/master/pre-registration'
import {WinterApplicationImport} from '@/components/winter-application-import'
import {WinterRegistrationOverview} from '@/components/winter-registration-overview'
const sessionKey=winterStorageKey('admin-session')
const field='mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-lg'
const button='inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold'
type Data=Awaited<ReturnType<typeof loadWinterData>>
export function WinterAdminDashboard(){
 const[session,setSession]=useState<AdminSession|null>(null),[checking,setChecking]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[loginError,setLoginError]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false)
 const[tab,setTab]=useState<WinterAdminTab>('requests'),[visited,setVisited]=useState<WinterAdminTab[]>(['requests'])
 const[registrationSection,setRegistrationSection]=useState<PreRegistrationSection>('roster')
 const[data,setData]=useState<Data|null>(null),[dataError,setDataError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false)
 const signedIn=!!session
 const[liveStatus,setLiveStatus]=useState('')
 const updateSession=useCallback((next:AdminSession)=>{sessionStorage.setItem(sessionKey,JSON.stringify(next));setSession(next)},[])
 const refresh=useCallback(()=>setRevision(v=>v+1),[])
 useEffect(()=>{if(!signedIn)return;return subscribeWinterUpdates('data',refresh,setLiveStatus)},[signedIn,refresh])
 function select(next:WinterAdminTab){setTab(next);setVisited(v=>v.includes(next)?v:[...v,next])}
 function openRegistration(section:PreRegistrationSection){
  setRegistrationSection(section);select('roster')
  requestAnimationFrame(()=>{
   const panel=document.getElementById('winter-panel-roster')
   panel?.scrollIntoView({block:'start'});panel?.focus({preventScroll:true})
  })
 }
 useEffect(()=>{
  let active=true
  if(window.location.hash==='#winter-admin-tools'){setTab('roster');setVisited(['requests','roster'])}
  if(window.location.hash==='#winter-initial-registration'){setTab('roster');setVisited(['requests','roster']);setRegistrationSection('entries')}
  if(window.location.hash==='#winter-application-import'){setTab('roster');setVisited(['requests','roster']);setRegistrationSection('application')}
  if(window.location.hash==='#winter-registration-overview'){setTab('roster');setVisited(['requests','roster']);setRegistrationSection('overview')}
  if(window.location.hash==='#winter-meeting'){setTab('meeting');setVisited(['requests','meeting'])}
  const raw=sessionStorage.getItem(sessionKey)
  if(!raw){setChecking(false);return}
  try{verifyAdminSession(JSON.parse(raw) as AdminSession).then(next=>{if(active)updateSession(next)}).catch(()=>{if(active)sessionStorage.removeItem(sessionKey)}).finally(()=>{if(active)setChecking(false)})}
  catch{sessionStorage.removeItem(sessionKey);setChecking(false)}
  return()=>{active=false}
 },[updateSession])
 useEffect(()=>{
  if(!signedIn)return
  const controller=new AbortController();setLoading(true);setDataError('')
  loadWinterData(controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted)setDataError(e instanceof Error?e.message:'Winterのデータを読み込めません')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[signedIn,revision])
 async function login(e:FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setLoginError('');try{updateSession(await signInAdmin(email.trim(),password));setPassword('')}catch(e){setLoginError(e instanceof Error?e.message:'ログインできません')}finally{lock.current=false;setBusy(false)}}
 function logout(){if(!window.confirm('未保存の入力がある場合は失われます。本部からログアウトしますか？'))return;sessionStorage.removeItem(sessionKey);setSession(null);setData(null);setPassword('');setVisited([tab])}
 return <div className="flex min-h-dvh flex-col bg-background">
 <div className="print-hide"><AppHeader subtitle="Winter 大会本部 管理画面" homeHref="/winter"/></div>
 <main className={`mx-auto w-full flex-1 px-5 py-6 ${session?'max-w-5xl print:max-w-none print:p-0':'max-w-xl'}`}>
 <div className="print-hide mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/winter" className={button}><ArrowLeft aria-hidden="true" className="size-6"/>受付画面へ</Link>{session&&<button type="button" className={button} onClick={logout}><LogOut aria-hidden="true" className="size-5"/>ログアウト</button>}</div>
 <p className="print-hide mb-5 text-lg font-semibold">{WINTER_EVENT_NAME}</p>
 {checking?<p role="status" className="text-xl">本部ログインを確認しています…</p>:!session?<form id="winter-admin-tools" onSubmit={login} className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
 <div className="flex items-center gap-3"><LogIn aria-hidden="true" className="size-8"/><h1 className="text-2xl font-bold">本部ログイン</h1></div><p>管理者アカウントでログインしてください。人馬と出番表の登録は、ログイン後の「事前登録」欄から操作できます。</p>
 <label className="block text-lg font-semibold">メールアドレス<input type="email" required autoComplete="username" className={field} disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label className="block text-lg font-semibold">パスワード<input type="password" required autoComplete="current-password" className={field} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {loginError&&<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">{loginError}</p>}<button type="submit" disabled={busy} className="min-h-16 w-full rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground disabled:opacity-50">{busy?'ログイン中…':'本部へログイン'}</button>
 </form>:<>
 <h1 className="sr-only">Winter 大会本部 管理画面</h1>
 <WinterAdminNavigation tab={tab} onSelect={select}/>
 <p role="status" className="print-hide mb-3">{liveStatus}</p>
 {tab!=='startlist'&&<> <div className="print-hide mb-5 flex flex-wrap items-center gap-3"><button className={button} disabled={loading} type="button" onClick={refresh}>{loading?'読み込み中…':'最新の情報を確認'}</button>{data&&<p>競技 {data.competitions.length}件 ／ 参加選手 {data.riders.length}名 ／ 参加馬 {data.horses.length}頭</p>}</div></>}
 {dataError&&<p role="alert" className="mb-4 rounded-xl bg-red-100 p-4 text-xl">{dataError}</p>}
 {tab!=='startlist'&&<WinterExportPanel session={session} onSession={updateSession}/>}
 {/* Visited panels remain mounted so tab changes preserve unsaved inputs and monitor state. */}
 {winterAdminTabs.filter(t=>visited.includes(t.id)).map(t=><section key={t.id} role="tabpanel" id={`winter-panel-${t.id}`} aria-labelledby={`winter-tab-${t.id}`} tabIndex={-1} hidden={tab!==t.id} className="space-y-5">
 {t.id==='roster'?<MasterPreRegistration selected={registrationSection} onSelect={setRegistrationSection}
 roster={<><p className="text-lg">団体を選ぶ → 参加する選手と馬にチェック →「参加チェックを保存」の順です。見つからない人馬は名簿全体を検索し、新規の場合は「新しい選手・馬を登録」を使います。</p><SharedRosterManager session={session} onParticipantsSaved={refresh}/>{data&&<WinterMasterRegistration session={session} organizations={data.organizations} onRegistered={refresh}/>}<button type="button" className={button} onClick={()=>openRegistration('entries')}>次へ：出番表の登録</button></>}
 entries={<div id="winter-initial-registration" className="space-y-4"><p className="text-lg">馬の所属団体 → 馬 → 競技・騎乗する選手を選び、内容と料金を確認して登録します。</p>{data?<WinterInitialEntryRegistration data={data} session={session} onChanged={refresh} onChooseParticipants={()=>openRegistration('roster')}/>:<p role="status">Winterのデータを読み込んでいます…</p>}<button type="button" className={button} onClick={()=>select('startlist')}>登録した出番表を確認</button></div>}
 application={<WinterApplicationImport session={session} onSession={updateSession} onChanged={refresh} onStartlist={()=>{refresh();select('startlist')}} onSettlement={()=>{refresh();select('settlement')}} onChanges={()=>select('on-site')}/>}
 overview={<WinterRegistrationOverview data={data} token={session.accessToken} active={tab==='roster'&&registrationSection==='overview'} loading={loading} error={dataError}/>}
 ><div className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-xl font-bold">CSV・TSVからの取込準備</h3><p className="text-lg">指定の見出しに合わせたCSV・TSVは、これまでの取込準備画面を使えます。</p><Link href="/winter/prepare" className={button}>CSV・TSVの取込準備を開く</Link></div></MasterPreRegistration>:
 t.id==='settlement'?(data?<WinterSettlementPanel data={data} session={session} revision={revision} onSession={updateSession} onChanged={refresh}/>:<p role="status">Winterのデータを読み込んでいます…</p>):
 t.id==='meeting'?<WinterMeetingPanel session={session} onSession={updateSession} onChanged={refresh} onStartlist={()=>select('startlist')}/>:
 !data?<p role="status">Winterのデータを読み込んでいます…</p>:
 t.id==='timetable'?<WinterTimetable data={data} session={session} onSession={updateSession} onChanged={refresh}/>:
 t.id==='requests'?<WinterRequestPanel session={session} onSession={updateSession} data={data} refresh={revision} onChanged={refresh} showWithdraw={false}/>:
 t.id==='startlist'?<WinterStartList data={data} session={session} onSession={updateSession} onChanged={refresh}/>:
 <><h2 className="text-2xl font-bold">事後登録</h2><div className="flex flex-wrap gap-3"><Link className={button} href="/winter/add">追加受付</Link><Link className={button} href="/winter/change">変更受付</Link></div><p>追加・変更は受付画面で入力し、未確定一覧からまとめて確定します。現場追加・再走行は下の専用欄で精算だけに登録します。</p><WinterInitialEntryRegistration settlementOnly data={data} session={session} onChanged={refresh} onChooseParticipants={()=>openRegistration('roster')}/><WinterSettlementActions data={data} session={session} onSession={updateSession} onChanged={refresh}/><details className="rounded-xl border-2 p-4"><summary className="cursor-pointer text-xl font-bold">出番表にも反映する棄権受付</summary><WinterRequestPanel mode="withdraw" session={session} onSession={updateSession} data={data} refresh={revision} onChanged={refresh}/></details></>}
 </section>)}
 </>}
 </main></div>
}

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
import {WinterInitialEntryRegistration} from '@/components/winter-initial-entry-registration'
import {WinterStartList} from '@/components/winter-start-list'
import {WinterRequestPanel} from '@/components/winter-request-panel'
import {WinterAdminNavigation,winterAdminTabs,type WinterAdminTab} from '@/components/winter-admin-navigation'
const sessionKey=winterStorageKey('admin-session')
const field='mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-lg'
const button='inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold'
type Data=Awaited<ReturnType<typeof loadWinterData>>
export function WinterAdminDashboard(){
 const[session,setSession]=useState<AdminSession|null>(null),[checking,setChecking]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[loginError,setLoginError]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false)
 const[tab,setTab]=useState<WinterAdminTab>('requests'),[visited,setVisited]=useState<WinterAdminTab[]>(['requests'])
 const[data,setData]=useState<Data|null>(null),[dataError,setDataError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false)
 const signedIn=!!session
 const updateSession=useCallback((next:AdminSession)=>{sessionStorage.setItem(sessionKey,JSON.stringify(next));setSession(next)},[])
 const refresh=useCallback(()=>setRevision(v=>v+1),[])
 function select(next:WinterAdminTab){setTab(next);setVisited(v=>v.includes(next)?v:[...v,next])}
 useEffect(()=>{
  let active=true
  if(window.location.hash==='#winter-admin-tools'){setTab('roster');setVisited(['requests','roster'])}
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
 <div className="flex items-center gap-3"><LogIn aria-hidden="true" className="size-8"/><h1 className="text-2xl font-bold">本部ログイン</h1></div><p>管理者アカウントでログインしてください。人馬名簿はログイン後の「人馬名簿」欄から操作できます。</p>
 <label className="block text-lg font-semibold">メールアドレス<input type="email" required autoComplete="username" className={field} disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label className="block text-lg font-semibold">パスワード<input type="password" required autoComplete="current-password" className={field} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {loginError&&<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">{loginError}</p>}<button type="submit" disabled={busy} className="min-h-16 w-full rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground disabled:opacity-50">{busy?'ログイン中…':'本部へログイン'}</button>
 </form>:<>
 <h1 className="sr-only">Winter 大会本部 管理画面</h1>
 <WinterAdminNavigation tab={tab} onSelect={select}/>
 <div className="print-hide mb-5 flex flex-wrap items-center gap-3"><Link href="/winter/prepare" className={button}>締切前の準備を確認</Link><button className={button} disabled={loading} type="button" onClick={refresh}>{loading?'読み込み中…':'最新の情報を確認'}</button>{data&&<p>競技 {data.competitions.length}件 ／ 参加選手 {data.riders.length}名 ／ 参加馬 {data.horses.length}頭</p>}</div>
 {dataError&&<p role="alert" className="mb-4 rounded-xl bg-red-100 p-4 text-xl">{dataError}</p>}
 {/* Visited panels remain mounted so tab changes preserve unsaved inputs and monitor state. */}
 {winterAdminTabs.filter(t=>visited.includes(t.id)).map(t=><section key={t.id} role="tabpanel" id={`winter-panel-${t.id}`} aria-labelledby={`winter-tab-${t.id}`} hidden={tab!==t.id} className="space-y-5">
 {t.id==='roster'?<><SharedRosterManager session={session} onParticipantsSaved={refresh}/>{data&&<WinterMasterRegistration session={session} organizations={data.organizations} onRegistered={refresh}/>}</>:
 t.id==='settlement'?<div className="rounded-xl border-2 bg-card p-5"><h2 className="text-2xl font-bold">精算（準備中）</h2><p className="mt-3 text-xl">Winterの精算・入金確認・精算書印刷は準備中です。現在は精算確定や印刷の操作はできません。</p></div>:
 t.id==='meeting'?<div className="space-y-4 rounded-xl border-2 bg-card p-5"><h2 className="text-2xl font-bold">打ち合わせ会</h2><p className="text-xl">仮出番表の組み替え・モニター表示・下見時間と開始時間の設定は「出番表」で操作できます。</p><button type="button" className={button} onClick={()=>select('startlist')}>出番表で確認・組み替え</button><p>打ち合わせ会専用の申請保留・一括確定は準備中です。</p></div>:
 !data?<p role="status">Winterのデータを読み込んでいます…</p>:
 t.id==='requests'?<WinterRequestPanel session={session} onSession={updateSession} data={data} refresh={revision} onChanged={refresh} showWithdraw={false}/>:
 t.id==='startlist'?<><details className="rounded-xl border-2 bg-card p-4"><summary className="cursor-pointer text-2xl font-bold">事前エントリーを出番表に登録</summary><div className="mt-4"><WinterInitialEntryRegistration data={data} session={session} onChanged={refresh}/></div></details><WinterStartList data={data} session={session} onSession={updateSession} onChanged={refresh}/></>:
 <><h2 className="text-2xl font-bold">事後登録</h2><div className="flex flex-wrap gap-3"><Link className={button} href="/winter/add">追加受付</Link><Link className={button} href="/winter/change">変更受付</Link></div><p>追加・変更は受付画面で入力し、未確定一覧からまとめて確定します。精算だけの登録は準備中です。</p><WinterRequestPanel mode="withdraw" session={session} onSession={updateSession} data={data} refresh={revision} onChanged={refresh}/></>}
 </section>)}
 </>}
 </main></div>
}

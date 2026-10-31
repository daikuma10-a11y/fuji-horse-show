"use client"
import {usePathname} from 'next/navigation'
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {winterStorageKey} from '@/lib/winter-event'
import {preparedReception,recoverSealedInput,offlineUrgentNotice,type WinterPreparation} from '@/lib/winter-offline'
const OfflinePreparedContext=createContext(false)
export function WinterReceptionDeliveryNotice(){const prepared=useContext(OfflinePreparedContext);return <p>{prepared?'追加・変更・棄権は、最後に受付に来た方のお名前を一度入力し、この端末に保存します。通信中は本部へ自動送信します。':'追加・変更・棄権は、最後の未確定一覧で受付に来た方のお名前を一度入力し、まとめて確定できます。受付の確定に本部ログインは不要です。'}</p>}
const paths=['/winter','/winter/add','/winter/change','/winter/withdraw','/winter/confirm']
export function WinterOfflineShell({children}:{children:ReactNode}){
 const pathname=usePathname()
 useEffect(()=>{const resume=(e:PageTransitionEvent)=>{if(e.persisted)location.reload()};window.addEventListener('pageshow',resume);return()=>window.removeEventListener('pageshow',resume)},[])
 const[p,setP]=useState<WinterPreparation|null>(null),[error,setError]=useState(''),[checked,setChecked]=useState(false)
 useEffect(()=>{
  let live=true;setChecked(false);setP(null);setError('')
  if(!paths.includes(location.pathname)||new URLSearchParams(location.search).get('meeting')==='1'){setChecked(true);return}
  async function refresh(){try{const next=await preparedReception();await recoverSealedInput();if(live){if(next)sessionStorage.removeItem(winterStorageKey('admin-session'));setP(next);setError('')}}catch(e){if(live)setError(e instanceof Error?e.message:'端末保存を確認できません')}finally{if(live)setChecked(true)}}
  void refresh()
  // Full navigation uses the prepared HTML on iPad; Next's RSC prefetch is not an offline dependency.
  function click(e:MouseEvent){const a=(e.target as Element)?.closest?.('a');if(!a||e.metaKey||e.ctrlKey||e.shiftKey||a.target==='_blank')return;const u=new URL(a.href);if(u.origin===location.origin&&paths.includes(u.pathname)&&!u.searchParams.has('meeting')){e.preventDefault();e.stopPropagation();location.assign(u.href)}}
  document.addEventListener('click',click,true);window.addEventListener('winter-offline-changed',refresh)
  return()=>{live=false;document.removeEventListener('click',click,true);window.removeEventListener('winter-offline-changed',refresh)}
 },[pathname])
 return <OfflinePreparedContext.Provider value={!!p}><div data-winter-reception-shell="1">{!checked?<p role="status" className="p-6 text-xl">端末の受付準備を確認しています…</p>:error?<div role="alert" className="m-5 rounded-xl bg-red-100 p-5 text-xl"><p>{error}</p><p>受付完了にはなっていません。保存済み内容は消さず、管理者へ確認してください。</p><a className="mt-4 inline-block rounded border-2 p-3 underline" href="/winter/admin#winter-offline-reception">管理者：預かっている受付を確認・送信</a></div>:<>
 {p&&<aside className="mx-auto max-w-5xl space-y-2 border-b-4 border-amber-500 bg-amber-50 p-4 text-lg"><p className="font-bold">オフライン受付の準備済み ／ この端末に預かる受付</p><p>{p.eventName} ／ データ取得：{new Date(p.retrievedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p><p>通信中も先に端末に保存し、本部へ自動送信します。通信断中の保存分は復旧後に送信します。精算・入金は通信中に本部で行ってください。</p><p className="font-bold">{offlineUrgentNotice}</p></aside>}
 {children}</> }</div></OfflinePreparedContext.Provider>
}

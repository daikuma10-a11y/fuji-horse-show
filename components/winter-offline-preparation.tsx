"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {prepareReception,WinterPreparationPending,type WinterPreparation} from '@/lib/winter-offline'
import {WINTER_QUEUE_KEY} from '@/lib/winter-batch'

type Phase='preparing'|'ready'|'waiting-input'|'waiting-network'|'error'
type Status={phase:Phase;preparation?:WinterPreparation;message?:string}
const titles:Record<Phase,string>={preparing:'オフライン受付を自動で準備しています…',ready:'オフライン受付の準備完了','waiting-input':'入力中の受付があるため、準備の更新を待っています','waiting-network':'通信の復旧を待っています',error:'オフライン受付の準備を完了できませんでした'}

/** Mounted only inside the signed-in Winter dashboard, independent of its tab. */
export function WinterOfflinePreparation({session,onSession,revision}:{session:AdminSession;onSession:(s:AdminSession)=>void;revision:number}){
 const[state,setState]=useState<Status>({phase:'preparing'})
 const latest=useRef({session,onSession});latest.current={session,onSession}
 const request=useRef<()=>void>(()=>{})
 useEffect(()=>{
  let live=true,running=false,pending=false,phase:Phase='preparing'
  let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined
  const show=(next:Status)=>{phase=next.phase;if(live)setState(next)}
  const online=()=>navigator.onLine!==false
  async function run(){
   timer=undefined;if(!live||running)return;pending=false
   if(!online()){show({phase:'waiting-network'});return}
   running=true;controller=new AbortController();show({phase:'preparing'})
   try{
    const verified=await verifyAdminSession(latest.current.session)
    if(!live)return
    latest.current.onSession(verified)
    const preparation=await prepareReception({signal:controller.signal})
    if(live)show({phase:'ready',preparation})
   }catch(error){
    if(live)show(error instanceof WinterPreparationPending?{phase:'waiting-input'}:!online()?{phase:'waiting-network'}:{phase:'error',message:error instanceof Error?error.message:'準備を確認できません'})
   }finally{
    running=false;controller=undefined
    if(live&&pending)schedule()
   }
  }
  function schedule(){pending=true;if(live&&!running&&timer===undefined)timer=setTimeout(()=>void run(),0)}
  const resumeInput=()=>{if(phase==='waiting-input')schedule()}
  const storage=(event:StorageEvent)=>{if(event.key===WINTER_QUEUE_KEY||event.key===null)resumeInput()}
  const visible=()=>{if(!document.hidden&&(phase==='waiting-input'||phase==='waiting-network'))schedule()}
  request.current=schedule
  window.addEventListener('online',schedule);window.addEventListener('winter-queue-changed',resumeInput);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visible)
  schedule()
  return()=>{live=false;controller?.abort();clearTimeout(timer);request.current=()=>{};window.removeEventListener('online',schedule);window.removeEventListener('winter-queue-changed',resumeInput);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible)}
 },[])
 // Coalesce saved roster/start-list changes; token refreshes and tab switches do
 // not restart preparation. A change during an attempt queues one fresh pass.
 useEffect(()=>{request.current()},[revision])
 return <section id="winter-offline-preparation" aria-label="オフライン受付の準備状況" className={`print-hide mb-5 space-y-2 rounded-xl border-2 p-4 ${state.phase==='ready'?'border-green-600 bg-green-50':state.phase==='error'?'border-red-600 bg-red-50':'border-amber-500 bg-amber-50'}`}>
  <p role={state.phase==='error'?'alert':'status'} className="text-xl font-bold">{titles[state.phase]}</p>
  {state.preparation&&<p>{state.preparation.eventName} ／ データ取得：{new Date(state.preparation.retrievedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
  {state.phase==='preparing'&&<p>画面・名簿・料金・出番を保存して確認しています。準備完了まで通信をつないでお待ちください。</p>}
  {state.phase==='ready'&&<p>通信が切れても受付をこの端末に預かれます。通信中は本部へ自動送信し、通信断中の保存分は復旧後に送信します。出番表への反映は本部が行います。</p>}
  {state.phase==='waiting-input'&&<p>入力中の受付を保存して本部へ戻ると、自動で準備を再開します。<a href="/winter/confirm" className="ml-2 inline-block min-h-12 content-center font-bold underline">入力中の受付を確認する</a></p>}
  {state.phase==='waiting-network'&&<p>本部画面を開いたまま通信が戻ると、自動で準備を再開します。</p>}
  {state.phase==='error'&&<><p>{state.message} 保存済み受付は消していません。</p><button type="button" className="min-h-14 rounded-xl border-2 border-blue-800 bg-white px-4 py-3 text-lg font-bold text-blue-900" onClick={()=>request.current()}>準備を再試行</button></>}
 </section>
}

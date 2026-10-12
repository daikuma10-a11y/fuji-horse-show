import {WINTER_EVENT_ID} from './winter-event'
export const WINTER_PUBLIC_URL='https://mhgyhyxagkkwdiepifdp.supabase.co'
export const WINTER_PUBLIC_KEY='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
type Signal={event_id:string;revision:number;monitor_revision:number}
export function winterSignalRevision(record:unknown,kind:'data'|'monitor'){
 if(!record||typeof record!=='object')return null
 const row=record as Signal,n=kind==='data'?row.revision:row.monitor_revision
 return row.event_id===WINTER_EVENT_ID&&Number.isSafeInteger(n)&&n>=0?n:null
}
/** Supabase's documented Phoenix JSON protocol. Only non-sensitive Winter counters. */
export function subscribeWinterUpdates(kind:'data'|'monitor',onChanged:()=>void,onStatus:(message:string)=>void){
 let stopped=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,joinTimeout:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined,attempt=0,ref=0,pendingHeartbeat:string|null=null,lastRevision:number|null=null
 const notify=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{if(!stopped)onChanged()},250)}
 function connect(){
  if(stopped)return
  clearTimeout(retry);onStatus('自動更新に接続中…')
  const ws=new WebSocket(WINTER_PUBLIC_URL.replace('https:','wss:')+`/realtime/v1/websocket?apikey=${WINTER_PUBLIC_KEY}&vsn=1.0.0`);socket=ws
  const topic='realtime:winter-updates-'+kind,joinRef=String(++ref)
  const send=(event:string,payload:unknown,eventRef=String(++ref),channel=topic)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({topic:channel,event,payload,ref:eventRef,join_ref:channel==='phoenix'?null:joinRef}));return eventRef}
  ws.onopen=()=>{send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'UPDATE',schema:'public',table:'fhs_winter_updates',filter:`event_id=eq.${WINTER_EVENT_ID}`}],private:false}},joinRef);joinTimeout=setTimeout(()=>ws.close(),15000)}
  ws.onmessage=event=>{
   let value;try{value=JSON.parse(String(event.data))}catch{return}
   if(value.topic==='phoenix'&&value.event==='phx_reply'&&value.ref===pendingHeartbeat){pendingHeartbeat=null;return}
   if(value.topic!==topic)return
   if(value.event==='phx_reply'&&value.ref===joinRef){
    if(value.payload?.status!=='ok'){ws.close();return}
    clearTimeout(joinTimeout);attempt=0;onStatus('自動更新に接続済み');notify()
    // Seed both dimensions once so monitor-only changes do not reload all entry data.
    if(lastRevision===null)void fetch(`${WINTER_PUBLIC_URL}/rest/v1/fhs_winter_updates?event_id=eq.${WINTER_EVENT_ID}&select=event_id,revision,monitor_revision`,{headers:{apikey:WINTER_PUBLIC_KEY,Authorization:`Bearer ${WINTER_PUBLIC_KEY}`},cache:'no-store'}).then(r=>r.ok?r.json():null).then(rows=>{if(!stopped&&socket===ws&&lastRevision===null&&Array.isArray(rows))lastRevision=winterSignalRevision(rows[0],kind)}).catch(()=>{})
    heartbeat=setInterval(()=>{if(pendingHeartbeat){ws.close();return}pendingHeartbeat=send('heartbeat',{},String(++ref),'phoenix')},25000)
   }else if(value.event==='postgres_changes'){
    const n=winterSignalRevision(value.payload?.data?.record,kind)
    if(n!==null&&(lastRevision===null||n>lastRevision)){lastRevision=n;notify()}
   }else if(value.event==='phx_error'||value.event==='phx_close'||value.event==='system'&&value.payload?.status==='error')ws.close()
  }
  ws.onerror=()=>ws.close()
  ws.onclose=()=>{if(socket!==ws)return;clearTimeout(joinTimeout);clearInterval(heartbeat);pendingHeartbeat=null;if(stopped)return;onStatus('自動更新が切断されています。再接続中…');retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5)))}
 }
 const resume=()=>{if(stopped)return;if(!socket||socket.readyState===WebSocket.CLOSED)connect()}
 const visible=()=>{if(document.visibilityState==='visible'){if(socket?.readyState===WebSocket.OPEN){socket.close()}else resume()}}
 connect();window.addEventListener('online',resume);document.addEventListener('visibilitychange',visible)
 return()=>{stopped=true;clearTimeout(retry);clearTimeout(joinTimeout);clearTimeout(debounce);clearInterval(heartbeat);socket?.close();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',visible)}
}

export async function loadRemoteWinterMonitor(signal?:AbortSignal){
 const query=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,select:'state,revision',limit:'1'})
 const response=await fetch(`${WINTER_PUBLIC_URL}/rest/v1/fhs_winter_monitor?${query}`,{headers:{apikey:WINTER_PUBLIC_KEY,Authorization:`Bearer ${WINTER_PUBLIC_KEY}`},cache:'no-store',signal})
 if(!response.ok)throw new Error('モニター表示を取得できません。通信を確認してください')
 const rows:unknown=await response.json();if(!Array.isArray(rows))throw new Error('モニター表示の形式を確認できません')
 return rows.length?rows[0].state:null
}

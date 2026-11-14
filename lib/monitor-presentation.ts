// Chrome's Presentation API owns the external window independently of the admin window.
export type MonitorPresentationConnection = EventTarget & {
 id: string
 state: 'connecting'|'connected'|'closed'|'terminated'
 send(message:string):void
 terminate():void
}
type Request = { start():Promise<MonitorPresentationConnection>; reconnect(id:string):Promise<MonitorPresentationConnection> }
type RequestConstructor = new (url:string)=>Request
type ConnectionList = EventTarget & { connections:MonitorPresentationConnection[] }
type Receiver = { connectionList:Promise<ConnectionList> }
const requestConstructor=()=>(window as Window & {PresentationRequest?:RequestConstructor}).PresentationRequest
const receiver=()=>(navigator as Navigator & {presentation?:{receiver?:Receiver|null}}).presentation?.receiver
export function isPresentationDisplay(){
 return new URLSearchParams(window.location.search).has('presentation') && !!receiver()
}
// A wired receiver may share the controller's storage partition. Isolate its local bus so a
// packet traverses the connection exactly once on both wired and remote displays.
export function displayChannelName(channel:string){return isPresentationDisplay()?channel+'-receiver':channel}
const toDisplay=new Set(['monitor-query','monitor-scroll','monitor-font','meeting-preview','meeting-alive','meeting-closed','draft-heartbeat','monitor-published'])
const toAdmin=new Set(['monitor-status','meeting-query','monitor-publication-query'])

function bridge(connection:MonitorPresentationConnection,channel:string,receiving:boolean,onEnd:()=>void){
 const bus=new BroadcastChannel(receiving?channel+'-receiver':channel)
 const outgoing=receiving?toAdmin:toDisplay, incoming=receiving?toDisplay:toAdmin
 bus.onmessage=({data})=>{
  if(connection.state==='connected' && outgoing.has(data?.kind))connection.send(JSON.stringify(data))
 }
 const message=(event:Event)=>{
  try{
   const data=JSON.parse((event as MessageEvent).data)
   if(incoming.has(data?.kind))bus.postMessage(data)
  }catch{/* Only monitor protocol messages are accepted. */}
 }
 const connected=()=>{
  if(receiving){
   for(const kind of ['meeting-query','monitor-publication-query'])connection.send(JSON.stringify({kind}))
   bus.postMessage({kind:'monitor-query'})
  }else connection.send(JSON.stringify({kind:'monitor-query'}))
 }
 const end=()=>{dispose();onEnd()}
 function dispose(){
  bus.close()
  connection.removeEventListener('message',message)
  connection.removeEventListener('connect',connected)
  connection.removeEventListener('close',end)
  connection.removeEventListener('terminate',end)
 }
 connection.addEventListener('message',message)
 connection.addEventListener('connect',connected)
 connection.addEventListener('close',end)
 connection.addEventListener('terminate',end)
 if(connection.state==='connected')connected()
 return dispose
}

export function listenForPresentation(channel:string){
 const display=isPresentationDisplay()?receiver():null
 if(!display)return
 let active=true,list:ConnectionList|undefined
 const connections=new Map<MonitorPresentationConnection,()=>void>()
 const accept=(connection:MonitorPresentationConnection)=>{
  if(!connections.has(connection) && (connection.state==='connected'||connection.state==='connecting'))
   connections.set(connection,bridge(connection,channel,true,()=>connections.delete(connection)))
 }
 const available=(event:Event)=>accept((event as Event & {connection:MonitorPresentationConnection}).connection)
 void display.connectionList.then(value=>{
  if(!active)return
  list=value;list.addEventListener('connectionavailable',available);list.connections.forEach(accept)
 }).catch(()=>{})
 return ()=>{active=false;list?.removeEventListener('connectionavailable',available);connections.forEach(dispose=>dispose())}
}

const sessions=new Map<string,Promise<MonitorPresentationConnection>>()
const storageKey=(channel:string)=>'fhs:monitor-presentation:'+channel
export function canPresent(){return typeof requestConstructor()==='function' && typeof BroadcastChannel!=='undefined'}
export async function connectPresentation(channel:string,path:string,restore=false):Promise<MonitorPresentationConnection|undefined>{
 const existing=sessions.get(channel)
 if(existing)return existing
 const Constructor=requestConstructor()
 if(!Constructor||!canPresent())return
 const key=storageKey(channel)
 let id:string|null=null
 try{id=window.sessionStorage.getItem(key)}catch{/* The connection still works without storage. */}
 if(restore&&!id)return
 const url=new URL(path,window.location.href);url.searchParams.set('presentation','1')
 const request=new Constructor(url.href)
 // start() must be called during the operator's click. Reconnect only during restoration.
 const pending=(restore?request.reconnect(id!):request.start()).then(connection=>{
  try{window.sessionStorage.setItem(key,connection.id)}catch{}
  bridge(connection,channel,false,clear)
  return connection
 }).catch(error=>{clear();throw error})
 function clear(){
  if(sessions.get(channel)!==pending)return
  sessions.delete(channel)
  try{window.sessionStorage.removeItem(key)}catch{}
 }
 sessions.set(channel,pending)
 return pending
}

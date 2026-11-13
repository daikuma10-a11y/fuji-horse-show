// The authenticated monitor publication identifies the admin tab that owns these controls.
export type ScrollKey = { x: string; y: string }
export type ScrollPosition = { sequence: number; fraction: number; y: number; extent: number }
export type ScrollView = { view: string; controller: ScrollKey }
type SignedScroll = ScrollView & ScrollPosition & { signature: string }
const channel = 'winter-startlist-scroll-v1'
export const winterScrollTopic = 'realtime:'+channel
const encoder = new TextEncoder()
function bytes(value:Uint8Array){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
export function isScrollKey(value:unknown):value is ScrollKey{
 const k=value as ScrollKey|null
 return !!k&&[k.x,k.y].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v))
}
function keyId(k:ScrollKey){return k.x+'.'+k.y}
function signedBytes(s:ScrollView & ScrollPosition){return encoder.encode(JSON.stringify([channel,keyId(s.controller),s.view,s.sequence,s.fraction,s.y,s.extent]))}
export async function createScrollController(){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify'])
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey)
 const controller={x:jwk.x!,y:jwk.y!}
 let sequence=0
 return {controller,async sign(view:string,position:Omit<ScrollPosition,'sequence'>):Promise<SignedScroll>{
  const payload={controller,view,...position,sequence:++sequence}
  return {...payload,signature:bytes(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,signedBytes(payload))))}
 }}
}
export function listenToScroll(view:ScrollView,onPosition:(position:ScrollPosition)=>void){
 let last=0,live=true,key:Promise<CryptoKey>|undefined
 return {close(){live=false},async receive(raw:unknown){
  const s=raw as SignedScroll|null
  if(!s||!isScrollKey(s.controller)||keyId(s.controller)!==keyId(view.controller)||s.view!==view.view||
    !Number.isSafeInteger(s.sequence)||s.sequence<=last||!Number.isFinite(s.y)||!Number.isFinite(s.extent)||s.y<0||s.extent<0||s.y>s.extent||
    !Number.isFinite(s.fraction)||s.fraction<0||s.fraction>1||typeof s.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(s.signature))return
  try{
   key??=crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',...view.controller},{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
   const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await key,decode(s.signature),signedBytes(s))
   if(live&&ok&&s.sequence>last){last=s.sequence;onPosition(s)}
  }catch{/* Ignore malformed or unsigned control messages. */}
 }}
}
export async function broadcastScroll(url:string,apiKey:string,signal:AbortSignal,payload:SignedScroll){
 const response=await fetch(url+'/realtime/v1/api/broadcast',{method:'POST',signal,headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify({messages:[{topic:channel,event:'scroll',payload}]})})
 if(!response.ok)throw new Error('スクロール位置を別端末へ送信できません')
}

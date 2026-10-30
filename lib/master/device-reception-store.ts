/** Durable, event-scoped device records. No network writes or automatic deletion. */
export type DeviceRecord = {id:string; revision:number; kind:'preparation'|'receipt'; eventId:string}
const databaseName='fhs-device-reception-v1'
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('この端末では受付内容を保存できません。通常のSafariで開いてください'));return}
  const request=indexedDB.open(databaseName,1)
  request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'id'})}
  request.onerror=()=>reject(new Error('端末の保存機能を開けません。内容は確定していません'))
  request.onblocked=()=>reject(new Error('別画面が保存機能を使用中です。その画面を閉じて再試行してください'))
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)}
 })
}
export async function readDeviceRecord<T extends DeviceRecord>(id:string):Promise<T|null>{
 const db=await open()
 try{return await new Promise<T|null>((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(id);let result:T|null=null;request.onsuccess=()=>{result=request.result??null};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(new Error('端末の保存内容を読み戻せません'))})}finally{db.close()}
}
export async function listDeviceRecords<T extends DeviceRecord>(eventId:string,kind:DeviceRecord['kind']):Promise<T[]>{
 const db=await open()
 try{return await new Promise<T[]>((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').getAll();let result:T[]=[];request.onsuccess=()=>{result=request.result.filter((r:T)=>r.eventId===eventId&&r.kind===kind)};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(new Error('端末の保存一覧を読み戻せません'))})}finally{db.close()}
}
/** Compare-and-swap prevents another tab or an interrupted older sender overwriting newer state. */
export async function writeDeviceRecord<T extends DeviceRecord>(record:T,expectedRevision:number|null):Promise<T>{
 const db=await open()
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),request=store.get(record.id)
  let conflict=false
  request.onsuccess=()=>{const old=request.result as DeviceRecord|undefined;if((old?.revision??null)!==expectedRevision||record.revision!==(expectedRevision??0)+1){conflict=true;tx.abort();return}try{store.put(record)}catch{tx.abort()}}
  tx.oncomplete=()=>resolve()
  tx.onabort=tx.onerror=()=>reject(new Error(conflict?'別画面で保存内容が変わりました。一覧を読み直してください':'端末に保存できませんでした。容量・保存設定を確認してください。受付は完了していません'))
 })}finally{db.close()}
 const saved=await readDeviceRecord<T>(record.id)
 if(!saved||JSON.stringify(saved)!==JSON.stringify(record))throw new Error('保存後の読み戻しを確認できません。一覧を読み直してください。新しい受付番号は作らないでください')
 return saved
}

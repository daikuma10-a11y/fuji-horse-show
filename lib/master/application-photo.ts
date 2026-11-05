import type {Application,ApplicationPhotoSource} from './application'
export type ApplicationPhotoPage={name:string;digest:string;dataUrl:string}
export const PHOTO_MAX_PAGES=6
export const PHOTO_MAX_REQUEST=3_800_000
export const PHOTO_MODEL='google/gemini-3-flash'
export const photoHash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('')
export async function photoApplicationDigest(pages:{digest:string}[],eventId:string){return photoHash(new TextEncoder().encode(JSON.stringify(['photo-application-v1',eventId,pages.map(p=>p.digest).sort()]))) }
export function readPhotoSource(value:unknown):ApplicationPhotoSource{
 const v=value as ApplicationPhotoSource
 if(!v||v.version!==1||!Array.isArray(v.pages)||v.pages.length<1||v.pages.length>PHOTO_MAX_PAGES||!Array.isArray(v.warnings)||v.warnings.length>100||typeof v.eventName!=='string'||v.eventName.length>300||typeof v.model!=='string'||v.model.length>100)throw new Error('写真の読取記録を確認できません')
 const pages=v.pages.map(p=>{if(!p||typeof p.name!=='string'||!p.name||p.name.length>255||typeof p.digest!=='string'||!/^[a-f0-9]{64}$/.test(p.digest))throw new Error('写真の識別情報を確認できません');return {name:p.name,digest:p.digest}})
 if(new Set(pages.map(p=>p.digest)).size!==pages.length||v.warnings.some(s=>typeof s!=='string'||s.length>1000))throw new Error('写真の読取記録を確認できません')
 return {version:1,pages,eventName:v.eventName,warnings:[...v.warnings],model:v.model}
}
/** Bind the explicit whole-photo review to the actual corrected fields, including row mappings. */
export function photoReviewSignature(app:Application){
 return JSON.stringify({digest:app.digest,club:app.club,people:app.people,entries:app.entries,amounts:app.amounts,stable:app.stable,stallRequest:app.stallRequest})
}
export const photoReviewComplete=(app:Application)=>!app.photo||app.photoConfirmation===photoReviewSignature(app)

/** Decode in the browser; the canvas output strips EXIF and never uploads the original file. */
export async function prepareApplicationPhotos(files:File[]):Promise<ApplicationPhotoPage[]>{
 if(files.length<1||files.length>PHOTO_MAX_PAGES)throw new Error(`同じ団体の写真を1〜${PHOTO_MAX_PAGES}枚選んでください`)
 const pages:ApplicationPhotoPage[]=[]
 for(const file of files){
  if(!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)||!file.size||file.size>20_000_000)throw new Error('写真は1枚20MB以内のJPEG・PNG・WebP・HEICで選んでください')
  const digest=await photoHash(new Uint8Array(await file.arrayBuffer()))
  if(pages.some(p=>p.digest===digest))throw new Error('同じ写真が重複しています。1枚だけ残してください')
  const url=URL.createObjectURL(file),image=new Image()
  try{
   await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error(`${file.name}を開けません。JPEGまたはPNGで保存して選び直してください`));image.src=url})
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>100_000_000)throw new Error('写真のサイズを確認してください')
   const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas')
   canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale)
   const context=canvas.getContext('2d');if(!context)throw new Error('写真を準備できません');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
   const dataUrl=canvas.toDataURL('image/jpeg',0.86)
   pages.push({name:file.name.slice(0,255),digest,dataUrl})
  }finally{URL.revokeObjectURL(url)}
 }
 if(new TextEncoder().encode(JSON.stringify({pages})).length>PHOTO_MAX_REQUEST)throw new Error('写真の合計サイズが大きいため読み取れません。余白を切り取り、文字が鮮明な写真を選び直してください')
 return pages
}

type CachedPhotos={digest:string;pages:ApplicationPhotoPage[];application:Application}
function readCachedPhotos(value:CachedPhotos,digest:string):CachedPhotos{
 if(!value||value.digest!==digest||value.application?.digest!==digest||!value.application.photo||!Array.isArray(value.pages))throw new Error('保存した写真と読み取り記録が一致しません')
 const source=readPhotoSource(value.application.photo)
 if(value.pages.length!==source.pages.length||value.pages.some((p,i)=>!p||p.digest!==source.pages[i].digest||p.name!==source.pages[i].name||typeof p.dataUrl!=='string'||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.dataUrl))||new TextEncoder().encode(JSON.stringify({pages:value.pages})).length>PHOTO_MAX_REQUEST)throw new Error('保存した原本写真を確認できません')
 return value
}
/** Device-only original previews and one immutable recognition result per set of source bytes. */
function photoDatabase(){return new Promise<IDBDatabase>((resolve,reject)=>{
 const r=indexedDB.open('fhs-application-photos-v1',1)
 r.onupgradeneeded=()=>{r.result.createObjectStore('photos',{keyPath:'digest'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('写真の端末保存を開けません'));r.onblocked=()=>reject(new Error('写真を開いている別の画面を閉じてください'))
})}
export async function loadApplicationPhotos(digest:string):Promise<CachedPhotos|null>{
 const db=await photoDatabase();try{return await new Promise((resolve,reject)=>{const r=db.transaction('photos','readonly').objectStore('photos').get(digest);r.onsuccess=()=>{try{resolve(r.result?readCachedPhotos(r.result,digest):null)}catch(e){reject(e)}};r.onerror=()=>reject(new Error('保存した写真を読み出せません'))})}finally{db.close()}
}
export async function saveApplicationPhotos(value:CachedPhotos):Promise<CachedPhotos>{
 readCachedPhotos(value,value.digest)
 const db=await photoDatabase();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos'),get=store.get(value.digest);let saved=value
  get.onsuccess=()=>{try{if(get.result)saved=readCachedPhotos(get.result,value.digest);else store.add(value)}catch{tx.abort()}}
  tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(new Error('写真の端末保存ができません。画面を閉じずに端末の空き容量を確認してください'));tx.onerror=()=>{}
 })}finally{db.close()}
}

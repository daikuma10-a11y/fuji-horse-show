/** Search keys only. Never use these keys to merge identities or rewrite stored names. */
export const candidateNameKey=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s　]/g,'').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60))
const looseKey=(value:string)=>candidateNameKey(value).replace(/[・･·ーｰ‐‑‒–—―−\-_.．。、,，/／()（）「」『』]/g,'')
type SearchIdentity={name:string;reading:string;jef:string}
const part=(a:string,b:string)=>Math.min([...a].length,[...b].length)>=2&&(a.includes(b)||b.includes(a))

export function searchIdentityCandidate(input:SearchIdentity,target:SearchIdentity,search?:string):{rank:number;reason:string}|null{
 const query=search?.trim()
 if(query){
  const number=query.normalize('NFKC').replace(/\s/g,'')
  if(/^\d+$/.test(number)&&target.jef===number)return {rank:0,reason:'検索した日馬連番号と一致'}
  if(/^\d{3,}$/.test(number)&&target.jef.startsWith(number))return {rank:3,reason:'日馬連番号の前方一致（候補）'}
 }
 const names=query?[query]:[input.name],readings=query?[query]:[input.reading]
 for(const name of names)if(candidateNameKey(name)&&candidateNameKey(name)===candidateNameKey(target.name))return {rank:1,reason:'名前の表記が一致（かな・空白・全半角を除く）'}
 for(const name of names)if(looseKey(name).length>=2&&looseKey(name)===looseKey(target.name))return {rank:2,reason:'名前の表記が近い（中点・長音などの違い）'}
 for(const reading of readings)if(candidateNameKey(reading)&&candidateNameKey(reading)===candidateNameKey(target.reading))return {rank:2,reason:'フリガナが一致（かな・空白・全半角を除く）'}
 for(const name of names)if(part(looseKey(name),looseKey(target.name)))return {rank:3,reason:'名前の一部が一致（候補）'}
 for(const reading of readings)if(part(looseKey(reading),looseKey(target.reading)))return {rank:4,reason:'フリガナの一部が一致（候補）'}
 return null
}

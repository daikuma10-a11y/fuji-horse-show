import type {ApplicationPerson,IdentityCandidate} from './application'

export type JefRiderRecord={member_no:string;name:string;rider_grade:string|null;import_date:string}
const normalized=(s:string)=>s.normalize('NFKC').trim()
const identity=(s:string)=>normalized(s).replace(/\s/g,'')
/** An explicit identity choice supplies its number, including absence; it never verifies it. */
export function applyApplicationCandidate(person:ApplicationPerson,candidate:IdentityCandidate|undefined,rows:JefRiderRecord[]){
 return autofillApplicationPerson({...person,...(candidate?{jef:candidate.jef.trim(),name:person.name.trim()?person.name:candidate.name,reading:person.reading.trim()?person.reading:candidate.reading}:{}),checked:false},rows)
}
export function kanaHorseReading(name:string){
 const value=normalized(name)
 return /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(value)&&/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)?value:''
}
export function jefRiderQualification(person:ApplicationPerson,rows:JefRiderRecord[]){
 const number=normalized(person.jef),records=rows.filter(r=>r.member_no===number)
 if(!number)return {grade:'',date:'',message:'日馬連番号を入力すると資格データを照合できます。'}
 if(!records.length)return {grade:'',date:'',message:'保存済みの日馬連資格データに該当がありません。申込書の資格を確認してください。'}
 const date=records.map(r=>r.import_date).sort().at(-1)!,latest=records.filter(r=>r.import_date===date)
 if(latest.some(r=>identity(r.name)!==identity(person.name)))return {grade:'',date,message:'日馬連番号と氏名の対応が一致しません。自動入力せず、氏名・番号を確認してください。'}
 const values=[...new Set(latest.map(r=>normalized(r.rider_grade??'').replace(/\s/g,'')))]
 if(values.length!==1)return {grade:'',date,message:'同じ取得日の日馬連資格データが一致しません。資格を確認してください。'}
 const match=values[0].match(/^(?:騎乗者資格)?([ABC])(?:級)?(?:騎乗者資格)?$/)
 if(!match)return {grade:'',date,message:values[0]?`日馬連の記載は「${values[0]}」です。限定資格をA・B・Cへ自動変換せず、資格と出場条件を確認してください。`:'日馬連資格データが空欄です。未登録とは判断せず、資格を確認してください。'}
 return {grade:match[1],date,message:''}
}
/** Supplement the editable review only; never alter workbook source or identity bindings. */
export function autofillApplicationPerson(person:ApplicationPerson,rows:JefRiderRecord[]):ApplicationPerson{
 let next={...person}
 if(next.kind==='horse'){
  if(next.readingAutofill&&next.reading===next.readingAutofill){next.reading='';delete next.readingAutofill}
  if(!next.reading.trim()){const reading=kanaHorseReading(next.name);if(reading){next.reading=reading;next.readingAutofill=reading}}
  return next
 }
 const source=next.gradeAutofill
 if(source&&(identity(source.name)!==identity(next.name)||source.memberNo!==normalized(next.jef))){
  if(next.grade===source.grade)next.grade=''
  delete next.gradeAutofill
 }
 if(next.gradeManual){delete next.gradeAutofill;return next}
 const found=jefRiderQualification(next,rows)
 if(found.grade){next.grade=found.grade;next.gradeAutofill={memberNo:normalized(next.jef),name:next.name,grade:found.grade,importDate:found.date}}
 else if(rows.some(r=>r.member_no===normalized(next.jef))&&next.gradeAutofill){next.grade='';delete next.gradeAutofill}
 return next
}

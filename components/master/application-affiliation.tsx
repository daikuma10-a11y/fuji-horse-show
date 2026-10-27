'use client'
import type {RosterAffiliationEdit} from '@/lib/master/application'
export type ApplicationAffiliationValue={affiliation:RosterAffiliationEdit;clubs:{id:string;name:string}[];currentClubs:{id:string;name:string}[]}
export function ApplicationAffiliationFields({personKey,applicationClub,affiliation,clubs,currentClubs,onChange}:{personKey:string;applicationClub:string;onChange:(value:RosterAffiliationEdit)=>void}&ApplicationAffiliationValue){
 const input='mt-1 min-h-10 w-full min-w-0 rounded border border-slate-400 bg-white p-2 text-sm'
 const destination=affiliation.source==='application'?applicationClub:affiliation.source==='existing'?clubs.find(c=>c.id===affiliation.clubId)?.name??'':affiliation.clubName.trim()
 const ending=currentClubs.filter(c=>affiliation.endClubIds.includes(c.id)),afterClubs=[...new Set([...currentClubs.filter(c=>!affiliation.endClubIds.includes(c.id)).map(c=>c.name),...(destination?[destination]:[])])]
 const changeAffiliation=(patch:Partial<RosterAffiliationEdit>)=>onChange({...affiliation,...patch})
 return (
 <fieldset className="space-y-3 rounded-lg border-2 border-amber-500 bg-white p-3"><legend className="px-1 font-bold">所属先の訂正・クラブ間の移動</legend>
   <label className="block">所属先の指定方法<select aria-label={`${personKey} 所属先の指定方法`} className={input} value={affiliation.source} onChange={e=>changeAffiliation({source:e.target.value as RosterAffiliationEdit['source'],clubId:'',clubName:'',endClubIds:[]})}>
    <option value="application">取り込み中のクラブ：{applicationClub}（第一候補）</option><option value="existing">登録済みクラブの一覧から選ぶ</option><option value="manual">クラブ名を手入力する</option>
   </select></label>
   {affiliation.source==='existing'&&<label className="block">登録済みの所属先クラブ<select aria-label={`${personKey} 登録済みの所属先クラブ`} className={input} value={affiliation.clubId} onChange={e=>changeAffiliation({clubId:e.target.value,endClubIds:affiliation.endClubIds.filter(id=>id!==e.target.value)})}><option value="">クラブを選択してください</option>{clubs.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
   {affiliation.source==='manual'&&<label className="block">所属先のクラブ名<input aria-label={`${personKey} 所属先のクラブ名`} className={input} value={affiliation.clubName} maxLength={100} onChange={e=>changeAffiliation({clubName:e.target.value,endClubIds:affiliation.endClubIds.filter(id=>clubs.find(c=>c.id===id)?.name!==e.target.value.trim())})}/><span className="text-sm">同じ名前のクラブがあれば既存の登録を使います。</span></label>}
   {currentClubs.length>0?<div><p className="font-bold">移動前の所属（終了するクラブにチェック）</p><p className="text-sm">チェックしない所属は兼所属として残します。</p>{currentClubs.map(c=><label className="mt-2 flex gap-2" key={c.id}><input aria-label={`${personKey} ${c.name}への所属を終了`} type="checkbox" checked={affiliation.endClubIds.includes(c.id)} disabled={c.name===destination} onChange={e=>changeAffiliation({endClubIds:e.target.checked?[...affiliation.endClubIds,c.id]:affiliation.endClubIds.filter(id=>id!==c.id)})}/>{c.name}{c.name===destination?'（移動先・継続）':'への所属を終了する'}</label>)}</div>:<p>現在の所属：なし</p>}
   <p className="font-bold">保存後の所属：{afterClubs.join('、')||'所属先を選択してください'}</p>
   {ending.length>0&&<p className="rounded bg-amber-100 p-2">終了する所属：{ending.map(c=>c.name).join('、')}。移動前の所属は履歴として残します。</p>}
   <p className="text-sm">登録済みの出番・請求先は変更しません。</p>
   {destination&&destination!==applicationClub&&<p className="rounded bg-blue-50 p-2">この申込の団体は「{applicationClub}」です。名簿の所属だけを「{destination}」へ訂正します。取り込み時は申込団体への所属または保存済みの参加登録を確認します。</p>}
  </fieldset>
 )
}

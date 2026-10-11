import {winterSettlementPrintHtml} from './winter-settlement-print'
import {validateWinterSettlementRecord,type WinterSettlementRecord} from './winter-checkout'
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function winterCheckoutPrintHtml(record:WinterSettlementRecord){
 const r=validateWinterSettlementRecord(record,record.organization_key)
 const method=r.payment_method==='bank_transfer'?'後日振込':r.payment_method==='cash_at_venue'?'当日現金（係員への支払い）':'追加のお支払いなし'
 const account={...r.account,instruction:r.payment_method==='bank_transfer'?{...r.account.instruction!,payment_method:'bank_transfer' as const}:r.payment_method==='cash_at_venue'?{payment_method:'cash_at_venue' as const,bank_details:'',event_id:r.event_id,organization_key:r.organization_key,updated_at:r.created_at,updated_by:''}:undefined}
 let html=winterSettlementPrintHtml(account,new Date(r.created_at)).replace('Fuji Horse Show 精算確認用（仮）','Fuji Horse Show 精算書').replace('登録済み競技料金・馬匹登録料の確認用です。最終請求書・領収書ではありません。',`保存済み精算内容／精算番号：${esc(r.id)}`).replace('馬匹登録料は所属団体の参加名簿から計上しています。その他料金は含みません。確認済み追加分入金は取消を差し引いた記録済み金額です。支払方法は予定の記録です。入金済みを示すものではなく、精算内容の確定は行っていません。',`確認者：${esc(r.confirmer_name)}。支払方法：${esc(method)}。現金・振込の選択は入金済みを示しません。この精算書は領収書ではありません。`).replace('支払方法（予定）','保存した支払方法').replace('Winter 精算確認用 - ','Winter 精算書 - ')
 if(r.payment_method==='no_payment_due')html=html.replace('<td>未設定</td>','<td>追加のお支払いなし</td>')
 return html
}

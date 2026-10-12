import {WINTER_EVENT_NAME} from './winter-event'
import type {winterSettlementAccount} from './winter-settlement'
import {winterMasterSettlementAccount} from './winter-master-settlement'
import {masterCheckoutPrintHtml} from './master/settlement-print'
type Account=ReturnType<typeof winterSettlementAccount>
/** Fresh read-only draft; uses the same master as saved statements, without saving. */
export function winterSettlementPrintHtml(account:Account,generatedAt=new Date()){
 const document=winterMasterSettlementAccount(account,generatedAt)
 document.document.title='Fuji Horse Show 精算確認用（仮）'
 document.document.summaryRows=[...(document.document.summaryRows??[]),{label:'事前料金合計',value:'¥'+account.initialTotal.toLocaleString('ja-JP')},{label:'支払方法（予定）',value:document.document.method}]
 document.document.notice=[WINTER_EVENT_NAME,'登録済み競技料金・馬匹登録料の確認用です。最終請求書・領収書ではありません。','馬匹登録料は所属団体の参加名簿から計上しています。その他料金は含みません。確認済み追加分入金は取消を差し引いた記録済み金額です。支払方法は予定の記録です。入金済みを示すものではなく、精算内容の確定は行っていません。',...(account.warnings.length?['要確認',...account.warnings]:[]),...(account.adjustments??[]).map(row=>`${row.reason}：¥${row.delta.toLocaleString('ja-JP')}`)].join('\n')
 return masterCheckoutPrintHtml({id:'draft',payment_method:account.instruction?.payment_method??'',amount:account.remaining,created_at:generatedAt.toISOString(),document,draft:true})
}

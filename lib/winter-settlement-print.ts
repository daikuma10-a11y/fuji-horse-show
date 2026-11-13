import {WINTER_EVENT_NAME} from './winter-event'
import type {WinterCheckoutAccount} from './winter-checkout'
import type {MasterSavedSettlement} from './master/self-settlement'
import {winterMasterSettlementAccount} from './winter-master-settlement'
import {masterCheckoutPrintHtml} from './master/settlement-print'
/** Fresh read-only draft; uses the same master as saved statements, without saving. */
export function winterSettlementDraft(account:WinterCheckoutAccount,generatedAt=new Date()):MasterSavedSettlement{
 const document=winterMasterSettlementAccount(account,generatedAt)
 document.document.title='Fuji Horse Show 精算書（確認用）'
 document.document.summaryRows=[...(document.document.summaryRows??[]),{label:'事前料金合計',value:'¥'+account.initialTotal.toLocaleString('ja-JP')},{label:'支払方法（予定）',value:document.document.method}]
 document.document.notice=[WINTER_EVENT_NAME,'競技料金・馬匹登録料の確認用です。最終請求書・領収書ではありません。','支払方法は予定です。入金額は各「入金済み」欄をご確認ください。',...(account.warnings.length?['要確認',...account.warnings]:[])].join('\n')
 return {id:'draft',payment_method:account.instruction?.payment_method??'',amount:account.remaining,created_at:generatedAt.toISOString(),document,draft:true}
}

export function winterSettlementPrintHtml(account:WinterCheckoutAccount,generatedAt=new Date()){
 return masterCheckoutPrintHtml(winterSettlementDraft(account,generatedAt))
}

import { formatYen } from '@/lib/fees'
import type { SettlementDocument } from '@/lib/settlement-document'
import type { SettlementReceipt } from '@/lib/settlement-receipts'

export function ReceiptPrint({ receipt }: { receipt: SettlementReceipt }) {
  return <div className="receipt-paper">
        <div className="flex items-start justify-between"><h2 className="text-3xl font-bold tracking-[0.5em]">領収書</h2><div className="text-sm">発行日：{receipt.issue_date}<br />No. {receipt.id}</div></div>
        <p className="receipt-recipient">{receipt.recipient}　様</p><p className="mt-6">下記、正に領収いたしました。</p>
        <div className="receipt-amount">金額　{formatYen(receipt.amount)}</div><p className="mt-3">但　{receipt.purpose}</p><p className="mt-2 text-sm">受領日：{receipt.issue_date} ／ {receipt.payment_method === 'bank_transfer' ? '振込' : '現金'} ／ 10%対象（税込）：{formatYen(receipt.amount)}</p>
        <div className="receipt-bottom"><div className="receipt-stamp">収入<br />印紙</div><div><p className="border-b pb-2">税抜金額　{formatYen(receipt.amount - receipt.tax_amount)}</p><p className="border-b py-2">消費税（10%内税）　{formatYen(receipt.tax_amount)}</p></div><div><p className="text-lg font-bold">{receipt.issuer_name}</p><p className="mt-2 whitespace-pre-wrap">{receipt.issuer_address}</p>{receipt.registration_number && <p className="mt-2">登録番号：{receipt.registration_number}</p>}<div className="receipt-seal">印</div></div></div>
      </div>
}

export function StatementPrint({ document }: { document: SettlementDocument }) {
  return <div className={`statement-paper ${document.lines.length > 18 ? 'statement-dense' : ''}`}>
        <h2 className="text-center text-2xl font-bold">Fuji Horse Show 精算書</h2><p className="mt-3 text-right">発行日：{document.issuedDate}</p><h3 className="mt-3 text-xl font-bold">{document.organization} 御中</h3>
        <table className="document-summary mt-5"><tbody><tr><th>事前エントリー合計</th><td>{formatYen(document.normalTotal)}</td></tr><tr><th>事前エントリー入金済み</th><td>{formatYen(document.advancePaid)} ／ {document.advanceRecorded ? document.advancePaid >= document.normalTotal ? '支払い済み' : '一部入金・不足あり' : '未登録・要確認'}</td></tr></tbody></table>
        <h4 className="mt-5 text-lg font-bold">締切後・大会期間中の追加・変更・棄権</h4><table className="document-lines mt-2"><thead><tr><th>区分</th><th>競技</th><th>選手</th><th>馬</th><th>備考・変更内容</th><th>金額</th><th>入金済み</th></tr></thead><tbody>{document.lines.length ? document.lines.map((line, index) => <tr key={index}><td>{line.action}</td><td>{line.competition}</td><td>{line.rider}</td><td>{line.horse}</td><td>{line.action.startsWith('棄権') ? '' : line.note || '—'}</td><td className="text-right">{formatYen(line.amount)}</td><td className="text-right">{formatYen(line.paid)}</td></tr>) : <tr><td colSpan={7}>追加・変更・棄権の記録はありません。</td></tr>}</tbody></table>
        <table className="document-summary mt-5"><tbody><tr><th>締切後・大会期間中 合計</th><td>{formatYen(document.extraTotal)}</td></tr><tr><th>締切後・大会期間中 入金済み</th><td>{formatYen(document.extraPaid)}</td></tr><tr className="font-bold"><th>差引不足額</th><td>{formatYen(document.due)}{document.due < 0 ? '（過入金・返金または充当を確認）' : ''}</td></tr><tr><th>不足額の支払方法</th><td>{document.method}</td></tr><tr><th>振込先</th><td className="whitespace-pre-wrap">{document.bankDetails || '—'}</td></tr></tbody></table>
        <p className="mt-5 text-sm">内容をご確認のうえ、お支払いをお願いいたします。</p>
      </div>
}

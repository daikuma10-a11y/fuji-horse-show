import { MasterReceptionHome } from "@/components/master/reception-home"
import { WINTER_EVENT_NAME } from "@/lib/winter-event"

export default function WinterReceptionHome() {
  return <MasterReceptionHome basePath="/winter" subtitle={WINTER_EVENT_NAME} notice={<div className="mt-6 space-y-2 text-center text-base text-muted-foreground"><p>追加・変更・棄権は、最後の未確定一覧で受付に来た方のお名前を一度入力し、まとめて確定できます。受付の確定に本部ログインは不要です。</p><p>精算は管理者ログインなしで操作できます。参加人馬は「大会本部」の参加チェックを保存すると受付で選べます。共通の人馬名簿は「大会本部」で管理できます。</p></div>} />
}

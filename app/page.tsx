import Link from "next/link"
import { PlusCircle, RefreshCw, XCircle, ClipboardList } from "lucide-react"
import { AppHeader } from "@/components/app-header"

const actions = [
  {
    href: "/add",
    label: "追加",
    description: "競技にエントリーを追加します",
    icon: PlusCircle,
    className: "bg-[oklch(0.46_0.1_155)] text-white",
  },
  {
    href: "/change",
    label: "変更",
    description: "競技・選手・馬を変更します",
    icon: RefreshCw,
    className: "bg-accent text-accent-foreground",
  },
  {
    href: "/withdraw",
    label: "棄権",
    description: "出場を取りやめます",
    icon: XCircle,
    className: "bg-destructive text-white",
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 py-8">
        <p className="mb-8 text-center text-2xl font-semibold text-foreground">
          ご希望の手続きを選んでください
        </p>

        <div className="grid gap-5">
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`flex min-h-32 items-center gap-6 rounded-3xl px-8 shadow-md transition active:scale-[0.99] ${a.className}`}
              >
                <Icon className="size-16 shrink-0" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-5xl font-bold">{a.label}</span>
                  <span className="mt-1 text-xl font-medium opacity-90">{a.description}</span>
                </span>
              </Link>
            )
          })}
        </div>

        <Link
          href="/admin"
          className="mx-auto mt-10 inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-6 text-lg font-semibold text-muted-foreground active:scale-[0.98]"
        >
          <ClipboardList className="size-6" aria-hidden="true" />
          大会本部（管理画面）
        </Link>
      </main>

      <footer className="pb-6 text-center text-base text-muted-foreground">
        Fuji Horse Show 大会受付システム（試作版）
      </footer>
    </div>
  )
}

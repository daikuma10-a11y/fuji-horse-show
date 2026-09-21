import Link from "next/link"

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-3xl font-bold tracking-wide sm:text-4xl">Fuji Horse Show</span>
          {subtitle ? (
            <span className="text-lg font-medium text-primary-foreground/85 sm:text-xl">{subtitle}</span>
          ) : (
            <span className="text-base font-medium text-primary-foreground/85">大会受付</span>
          )}
        </Link>
      </div>
    </header>
  )
}

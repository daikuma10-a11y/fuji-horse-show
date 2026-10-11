import Link from "next/link"
import Image from "next/image"

export function AppHeader({ subtitle, homeHref = "/" }: { subtitle?: string; homeHref?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-6">
        <Link href={homeHref} className="flex flex-col leading-tight">
          <span className="text-2xl font-bold tracking-wide sm:text-4xl">Fuji Horse Show</span>
          {subtitle ? (
            <span className="text-lg font-medium text-primary-foreground/85 sm:text-xl">{subtitle}</span>
          ) : (
            <span className="text-base font-medium text-primary-foreground/85">大会受付</span>
          )}
        </Link>
        <a href="https://www.fujifarm.jp/" target="_blank" rel="noopener noreferrer" aria-label="フジファーム公式サイト" className="flex shrink-0 items-center rounded-lg bg-white p-1">
          <Image src="/ff-logo.jpg" alt="ライディングクラブ フジファーム" width={80} height={80} className="size-14 object-contain sm:size-20" priority />
        </a>
      </div>
    </header>
  )
}

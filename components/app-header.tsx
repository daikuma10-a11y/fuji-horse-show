import Link from "next/link"
import Image from "next/image"

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-2xl font-bold tracking-wide sm:text-4xl">Fuji Horse Show</span>
          {subtitle ? (
            <span className="text-lg font-medium text-primary-foreground/85 sm:text-xl">{subtitle}</span>
          ) : (
            <span className="text-base font-medium text-primary-foreground/85">大会受付</span>
          )}
        </Link>
        <a href="https://www.fujifarm.jp/" target="_blank" rel="noopener noreferrer" aria-label="フジファーム公式サイト" className="flex shrink-0 items-center rounded-lg bg-white px-2 py-1">
          <Image unoptimized src="https://www.fujifarm.jp/images/h_logo_pc.png" alt="フジファーム" width={140} height={52} className="h-auto w-16 sm:w-36" />
        </a>
      </div>
    </header>
  )
}

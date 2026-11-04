import type { ReactNode } from 'react'
import { startRepeatColors, type StartRepeat } from '@/lib/master/start-list-repeats'

export function StartRepeatName({ kind, repeat, name, children }: { kind: 'rider' | 'horse'; repeat?: StartRepeat; name: string; children: ReactNode }) {
  if (!repeat) return <>{children}</>
  const label = kind === 'rider' ? '選' : '馬'
  const description = `${name}：${kind === 'rider' ? '選手' : '馬'}${repeat.group}・この競技に${repeat.count}回出場`
  return <span data-repeat-kind={kind} data-repeat-group={repeat.group} title={description} className="flex min-w-0 items-center gap-1 rounded border-l-[3px] px-1" style={startRepeatColors[repeat.color]}>
    <span className="shrink-0 text-[10px] font-bold" aria-label={description}>{label}{repeat.group}×{repeat.count}</span>
    <span className="min-w-0 truncate">{children}</span>
  </span>
}

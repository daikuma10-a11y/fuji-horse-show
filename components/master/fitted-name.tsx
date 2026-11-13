"use client"
import {useLayoutEffect, useRef} from 'react'

export function FittedName({ name, fontSize, scale = 1, mark }: { name: string; fontSize: number; scale?: number; mark?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = container.current, label = text.current
    if (!box || !label) return
    let active = true
    const fit = () => {
      if (!active) return
      const base = fontSize * scale
      label.style.fontSize = `${base}px`
      const width = label.getBoundingClientRect().width
      if (width > box.clientWidth && box.clientWidth > 0) label.style.fontSize = `${base * Math.max(0, box.clientWidth - 1) / width}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    void document.fonts.ready.then(fit)
    return () => { active = false; observer.disconnect() }
  }, [name, fontSize, scale, mark])
  return <div ref={container} className="w-full overflow-hidden"><span ref={text} className="inline-block whitespace-nowrap" style={{ fontSize: fontSize * scale }}>{name}{mark && <span className="ml-[0.25em] text-[.75em]">{mark}</span>}</span></div>
}

"use client"

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { fitVendor, vendorKinds, vendorMap, type Vendor, type VendorPosition } from '@/lib/master/vendor-layout'
import { usePrintDocument } from './use-print-document'

type Props = {
  venue: ReactNode; eventName: string; vendors: Vendor[]; selected: string
  onSelect: (id: string) => void; onMove: (id: string, position: VendorPosition) => void
}
const { width, height, boxWidth, boxHeight } = vendorMap

function nameLines(name: string) {
  const letters = Array.from(name)
  const glyphWidth = (letter: string) => /[ -~]/.test(letter) ? 0.8 : 1
  const units = letters.reduce((length, letter) => length + glyphWidth(letter), 0)
  const singleLineSize = Math.min(16, Math.floor((boxWidth - 6) / units))
  if (singleLineSize >= 11) return { lines: [name], size: singleLineSize }
  // Fit longer names on multiple lines without truncating them.
  for (let size = 16; size >= 3; size--) {
    const lines = ['']
    let used = 0
    for (const letter of letters) {
      const advance = size * glyphWidth(letter)
      if (used + advance > boxWidth - 6) { lines.push(''); used = 0 }
      lines[lines.length - 1] += letter
      used += advance
    }
    if (lines.length * (size + 1) <= boxHeight - 4) return { lines, size }
  }
  return { lines: [name], size: 3 }
}

export function VendorMap({ venue, eventName, vendors, selected, onSelect, onMove }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ vendor: Vendor; pointer: number; start: VendorPosition } | null>(null)
  const [preview, setPreview] = useState<(VendorPosition & { vendor: Vendor }) | null>(null)
  const printer = usePrintDocument()

  function point(e: { clientX: number; clientY: number }) {
    const box = svg.current!.getBoundingClientRect()
    return { x: (e.clientX - box.left) * width / box.width, y: (e.clientY - box.top) * height / box.height }
  }
  function begin(e: PointerEvent<SVGGElement>, vendor: Vendor) {
    if (e.button !== 0 || !e.isPrimary) return
    onSelect(vendor.id)
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { vendor, pointer: e.pointerId, start: point(e) }
  }
  function move(e: PointerEvent<SVGGElement>, vendor: Vendor, finish: boolean) {
    const active = drag.current
    if (!active || active.pointer !== e.pointerId || active.vendor !== vendor) return
    const at = point(e)
    const pos = fitVendor(vendor.x + at.x - active.start.x, vendor.y + at.y - active.start.y)
    if (finish) {
      drag.current = null
      setPreview(null)
      if (pos.x !== vendor.x || pos.y !== vendor.y) onMove(vendor.id, pos)
    } else setPreview({ vendor, ...pos })
  }
  function cancel(e: PointerEvent<SVGGElement>) {
    if (drag.current?.pointer === e.pointerId) { drag.current = null; setPreview(null) }
  }
  function printMap() {
    void printer.print(async () => {
      const diagram = svg.current!.cloneNode(true) as SVGSVGElement
      diagram.querySelectorAll('[data-selection]').forEach(el => el.remove())
      const report = document.createElement('main')
      const heading = document.createElement('h1')
      heading.textContent = eventName + '　出店配置図'
      const legend = document.createElement('p')
      for (const { label, fill, stroke } of Object.values(vendorKinds)) {
        const item = document.createElement('span')
        item.textContent = label
        item.style.cssText = `background:${fill};border:1px solid ${stroke};padding:2px 12px;margin-right:10px`
        legend.appendChild(item)
      }
      report.append(heading, legend, diagram)
      return `<!DOCTYPE html><html lang="ja"><meta charset="utf-8"><title>出店配置図</title><style>
        @page{size:A4 landscape;margin:9mm}body{font:14px sans-serif;color:#263a34}h1{font-size:18pt;margin:3mm 0}svg{display:block;width:100%;height:auto}
        main{break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}nav{margin-bottom:12px}@media print{body{margin:0}nav{display:none}}
        </style><nav><button id="stable-print">印刷</button> <button id="stable-close">閉じる</button></nav>${report.outerHTML}</html>`
    }, '横')
  }

  return <>
    <p className="text-sm">札をドラッグして移動します。札を選び、図の空いている場所をタップしても配置できます。</p>
    <div className="overflow-x-auto rounded-lg border-2 bg-white">
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} aria-label="業者を配置する会場図"
        style={{ display: 'block', width: '100%', minWidth: 720, height: 'auto', userSelect: 'none' }}>
        {venue}
        <rect width={width} height={height} fill="transparent" onClick={e => {
          if (!selected) return
          const at = point(e)
          onMove(selected, fitVendor(at.x - boxWidth / 2, at.y - boxHeight / 2))
        }} />
        {vendors.map(vendor => {
          const { fill, stroke, label } = vendorKinds[vendor.kind]
          const pos = preview?.vendor === vendor ? preview : vendor
          const { lines, size } = nameLines(vendor.name)
          return <g key={vendor.id} data-vendor-id={vendor.id} transform={`translate(${pos.x} ${pos.y})`}
            tabIndex={0} role="button" aria-label={label + '　' + vendor.name} aria-pressed={selected === vendor.id}
            style={{ cursor: 'grab', touchAction: 'none' }} onFocus={() => onSelect(vendor.id)}
            onPointerDown={e => begin(e, vendor)} onPointerMove={e => move(e, vendor, false)} onPointerUp={e => move(e, vendor, true)}
            onPointerCancel={cancel} onLostPointerCapture={cancel}
            onKeyDown={e => {
              const step = e.shiftKey ? 10 : 1
              const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
              if (delta[e.key]) {
                e.preventDefault()
                const [dx, dy] = delta[e.key]
                onMove(vendor.id, fitVendor(vendor.x + dx, vendor.y + dy))
              } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(vendor.id) }
            }}>
            <title>{label + '　' + vendor.name}</title>
            <rect width={boxWidth} height={boxHeight} rx="2" fill={fill} stroke={stroke} strokeWidth="2" />
            {selected === vendor.id && <rect data-selection="" x="-3" y="-3" width={boxWidth + 6} height={boxHeight + 6} rx="3" fill="none" stroke="#253b35" strokeWidth="2" strokeDasharray="4 3" />}
            <text textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize={size} fill="#172524" pointerEvents="none">
              {lines.map((line, i) => <tspan key={i} x={boxWidth / 2} y={boxHeight / 2 + (i - (lines.length - 1) / 2) * (size + 1) + size * 0.34}>{line}</tspan>)}
            </text>
          </g>
        })}
      </svg>
    </div>
    <button type="button" className="min-h-11 rounded-lg border-2 px-4 font-bold" onClick={printMap} disabled={printer.busy}>出店配置図を印刷</button>
    {printer.error && <p role="alert">{printer.error}</p>}
    {printer.notice && <p role="status">{printer.notice}</p>}
  </>
}

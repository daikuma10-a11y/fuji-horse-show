import { barnIds } from '@/lib/master/stall-allocation'

// Fixed landmarks from the organizer's Winter exhibitor plan, in map coordinates.
export function WinterVendorVenue() {
  const starts = [8, 119, 212, 305, 398, 491, 594, 687, 780, 873, 966]
  return <g fontFamily="sans-serif" fill="#364342" textAnchor="middle" pointerEvents="none">
    <rect width="1280" height="620" fill="#fcfbf7" />
    <path d="M8 36 H1040" stroke="#879895" />
    <text x="525" y="26" fontSize="22" fontWeight="bold">競 技 場 側</text>
    {barnIds.map((barn, i) => {
      const x = starts[i], width = i === 0 ? 85 : 74
      return <g key={barn}>
        <text x={x + width / 2} y="82" fontSize="23" fontWeight="bold">{barn}</text>
        <rect x={x} y="111" width={width} height={i === 0 ? 405 : 343} fill="#e5ebe6" stroke="#70827a" strokeWidth="1.6" />
        <path d={i === 0
          ? `M${x} 139 h${width} M${x+12} 114 v25 M${x+25} 114 v25 M${x+55} 114 v25 M${x+69} 114 v25`
          : `M${x} 139 h${width} M${x} 125 h${width} M${x + width / 2} 111 v28`} fill="none" stroke="#94a59c" />
      </g>
    })}
    <text x="1188" y="104" fontSize="20">駐車場</text>
    <path d="M1119 139 H1193 L1266 202 V516 H1119 Z" fill="#eef1f1" stroke="#859491" strokeWidth="1.5" />
    <g fill="#edeae0" stroke="#8b877b" strokeWidth="1.5">
      <ellipse cx="185" cy="570" rx="43" ry="40" />
      <rect x="290" y="532" width="88" height="29" />
      <rect x="424" y="542" width="136" height="46" />
      <path d="M458 542 v46" />
      <rect x="570" y="542" width="106" height="46" />
      <rect x="875" y="536" width="122" height="42" transform="rotate(-4 936 557)" />
      <path d="M243 609 L719 596 V551 M779 552 L790 596 L1034 579" fill="none" />
    </g>
    <g fontSize="16">
      <text x="185" y="576">丸馬場</text><text x="334" y="552">装蹄所</text>
      <text x="507" y="571">休憩室</text><text x="623" y="571">HM室</text>
      <text x="936" y="563" transform="rotate(-4 936 557)">オガコ倉庫</text>
    </g>
  </g>
}

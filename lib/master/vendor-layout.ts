export type VendorKind = 'food' | 'tack'
export type VendorPosition = { x: number; y: number }
export type Vendor = VendorPosition & { id: string; name: string; kind: VendorKind }

export const vendorMap = { width: 1280, height: 620, boxWidth: 84, boxHeight: 38 }
export const vendorKinds = {
  food: { label: '飲食', fill: '#ffe09b', stroke: '#8b5300' },
  tack: { label: '馬具', fill: '#c5e2ff', stroke: '#22598a' },
} as const

export function fitVendor(x: number, y: number): VendorPosition {
  return {
    x: Math.max(0, Math.min(vendorMap.width - vendorMap.boxWidth, Math.round(x))),
    y: Math.max(0, Math.min(vendorMap.height - vendorMap.boxHeight, Math.round(y))),
  }
}

export function nextVendorPosition(vendors: Vendor[], origin: VendorPosition): VendorPosition {
  const { width, height, boxWidth, boxHeight } = vendorMap
  const slots = (size: number, box: number, start: number) => {
    const all = Array.from({ length: Math.floor(size / (box + 4)) }, (_, i) => i * (box + 4) + 2)
    return [...all.filter(n => n >= start), ...all.filter(n => n < start)]
  }
  for (const y of slots(height, boxHeight, origin.y)) {
    for (const x of slots(width, boxWidth, origin.x)) {
      if (vendors.every(v => Math.abs(v.x - x) >= boxWidth || Math.abs(v.y - y) >= boxHeight)) return { x, y }
    }
  }
  return fitVendor(origin.x, origin.y)
}

export function vendorLayoutFile(eventId: string, vendors: Vendor[]) {
  return JSON.stringify({ type: 'fhs-vendor-layout', version: 1, eventId, vendors })
}

export function readVendorLayout(text: string, eventId: string): Vendor[] {
  const file = JSON.parse(text)
  if (file?.type !== 'fhs-vendor-layout' || file.version !== 1 || file.eventId !== eventId || !Array.isArray(file.vendors)) {
    throw new Error('この大会の出店配置ファイルを選んでください。')
  }
  const ids = new Set<string>()
  return file.vendors.map((v: Vendor) => {
    if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || typeof v.name !== 'string' ||
      !v.name.trim() || Array.from(v.name).length > 50 || (v.kind !== 'food' && v.kind !== 'tack') ||
      !Number.isSafeInteger(v.x) || !Number.isSafeInteger(v.y) || fitVendor(v.x, v.y).x !== v.x || fitVendor(v.x, v.y).y !== v.y) {
      throw new Error('出店業者の名前・区分・位置を確認してください。')
    }
    ids.add(v.id)
    return { id: v.id, name: v.name.trim(), kind: v.kind, x: v.x, y: v.y }
  })
}

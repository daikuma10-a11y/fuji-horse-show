export type MonitorReport = { kind: 'monitor-status'; competition: string; pending: boolean; fullscreen: boolean; ready: boolean; hidden: boolean; width: number; height: number; x: number; y: number; fontSize: number }
export function isMonitorReport(value: unknown): value is MonitorReport {
 const data = value as MonitorReport | null
 return !!data && data.kind === 'monitor-status' && typeof data.competition === 'string' && ['pending','fullscreen','ready','hidden'].every(key => typeof (data as unknown as Record<string,unknown>)[key] === 'boolean') && [data.width,data.height,data.x,data.y,data.fontSize].every(Number.isFinite) && data.width > 0 && data.width <= 5000 && data.height > 0 && data.height <= 5000 && data.x >= 0 && data.y >= 0 && data.fontSize >= 12 && data.fontSize <= 24
}

export type TimetableSection = {id: string; label: string; venue?: string; showInspection: boolean}
export type MasterTimetableItem={timingSection?:TimetableSection;id:string;date:string;competition:string;official:boolean;count:number;inspection:string|null;start:string|null;phase?:'provisional'|'final'}

export const masterTimetableChoices = {
 inspection: ['オープン', '組み換え時間', '前競技と同時'],
 start: ['前競技に引き続き'],
} as const
export type MasterTimetableTimeKind = keyof typeof masterTimetableChoices

/** A clock time or an explicitly supported instruction; never arbitrary text. */
export function isMasterTimetableTime(value: unknown, kind: MasterTimetableTimeKind): value is string | null {
 return value === null || typeof value === 'string' && (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value) || (masterTimetableChoices[kind] as readonly string[]).includes(value))
}

/** Preserve a manually chosen inspection instruction when the start changes. */
export function inspectionForStart(inspection: string, previousStart: string, newStart: string): string {
  function fifteenMinutesBefore(time: string) {
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return ''
    const [hours, minutes] = time.split(':').map(Number)
    const earlier = (hours * 60 + minutes - 15 + 1440) % 1440
    return String(Math.floor(earlier / 60)).padStart(2, '0') + ':' + String(earlier % 60).padStart(2, '0')
  }
  return !inspection || inspection === fifteenMinutesBefore(previousStart) ? fifteenMinutesBefore(newStart) : inspection
}

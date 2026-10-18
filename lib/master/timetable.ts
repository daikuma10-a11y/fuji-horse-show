export type MasterTimetableItem={id:string;date:string;competition:string;official:boolean;count:number;inspection:string|null;start:string|null;phase?:'provisional'|'final'}

export const masterTimetableChoices = {
 inspection: ['オープン', '組み換え時間'],
 start: ['前競技に引き続き'],
} as const
export type MasterTimetableTimeKind = keyof typeof masterTimetableChoices

/** A clock time or an explicitly supported instruction; never arbitrary text. */
export function isMasterTimetableTime(value: unknown, kind: MasterTimetableTimeKind): value is string | null {
 return value === null || typeof value === 'string' && (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value) || (masterTimetableChoices[kind] as readonly string[]).includes(value))
}

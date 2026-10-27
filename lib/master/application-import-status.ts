/** Display-only observations; never serialized as registration evidence. */
export type ApplicationImportProgress={
 phase:'checking'|'roster'|'people'|'participation'|'credentials'|'entries'|'verifying'
 detail:string
 peopleConfirmed:number;peopleTotal:number;entriesConfirmed:number;entriesTotal:number
}
export type ApplicationImportFeedback={
 state:'running'|'success'|'ready'|'stopped'|'error'|'attention'
 operation:'save'|'review'
 progress:ApplicationImportProgress
 detail:string
 checkedAt?:string
 stopRequested?:boolean
}

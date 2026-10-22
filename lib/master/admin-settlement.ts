/** Saved charges and recorded payments, supplied by the event adapter. */
export type AdminSettlementBalance={total:number;paid:number;remaining:number}
export type AdminSettlementGroup={
 id:string
 name:string
 extraTotal:number
 hasAdvance:boolean
 balance?:AdminSettlementBalance
 warnings?:readonly string[]
}

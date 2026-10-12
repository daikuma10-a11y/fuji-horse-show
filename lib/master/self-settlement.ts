import type {SettlementDocument,SettlementDocumentLine} from '../settlement-document'
export type MasterSettlementDocument=Omit<SettlementDocument,'lines'>&{
 lines:(Omit<SettlementDocumentLine,'paid'>&{paid?:number})[]
 notice?:string
 summaryRows?:{label:string;value:string}[]
}
export type MasterSettlementAccount={document:MasterSettlementDocument;normalLines:{id:string;competition:string;rider:string;horse:string;amount:number}[];warnings:string[]}
export type MasterSavedSettlement={id:string;organization_key?:string;confirmed_by?:string;payment_method:string;amount:number;created_at:string;document:MasterSettlementAccount}
export type MasterSettlementViewProps={
 organizations:{id:string;name:string}[];query:string;org:string;account:MasterSettlementAccount|null;record:MasterSavedSettlement|null;history:MasterSavedSettlement[];busy:boolean;error:string;consult:boolean;checked:boolean;name:string;method:string
 homeHref?:string;normalDetails?:boolean;locked?:boolean;pendingMessage?:string;canEditSaved?:boolean
 canUseMethod?:(method:string)=>boolean
 onQuery:(value:string)=>void;onName:(value:string)=>void;onMethod:(value:string)=>void;onChecked:(value:boolean)=>void;onConsult:()=>void;onSelect:(id:string)=>void;onReset:()=>void;onConfirm:()=>void;onPrint:()=>void;onEditSaved:()=>void;onHistory:()=>void;onChooseHistory:(record:MasterSavedSettlement)=>void;onRetry?:()=>void
}

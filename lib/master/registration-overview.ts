export type RegistrationOverviewCredential={value:string;source:string;needsReview:boolean}
export type RegistrationOverviewPerson={id:string;name:string;number:string;organization:string;entryCount:number;credential?:RegistrationOverviewCredential}
export type RegistrationOverviewEntry={id:string;date:string;competition:string;startOrder:number|null;rider:string;horse:string;isOp:boolean;withdrawn:boolean;status:string}
export type RegistrationOverviewGroup={
 id:string
 name:string
 riders:RegistrationOverviewPerson[]
 horses:RegistrationOverviewPerson[]
 entries:RegistrationOverviewEntry[]
 activeCount:number
 withdrawnCount:number
}

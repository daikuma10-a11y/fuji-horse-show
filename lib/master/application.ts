/** Event-neutral review data. Identity suggestions are never persisted automatically. */
export type Origin = {sheet:string;cell:string;value:string;formula?:string}
export type ApplicationPerson = {key:string;kind:'rider'|'horse';name:string;reading:string;jef:string;grade:string;horseGrade?:string;credentialOrigin?:Origin;checked:boolean;sportsMember:string;instructorMember:string;qualified:boolean;origin:Origin}
export type ApplicationEntry = {key:string;competition:string;rider:string;horse:string;op:boolean;rawRider:string;rawHorse:string;origin:Origin}
export type Application = {fileName:string;digest:string;eventId:string;club:string;clubOrigin:Origin;people:ApplicationPerson[];entries:ApplicationEntry[];amounts:{horse:string;jump:string;dressage:string;total:string};amountOrigins:Record<string,Origin>;issues:string[];sheets:string[]}
export type IdentityCandidate = {id:string;name:string;reading:string;jef:string;reason:string;clubs:string[]}
export type ApplicationDifference = {location:string;before:string;after:string;kind:string}

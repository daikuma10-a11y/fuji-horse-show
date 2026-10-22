/** Neutral presentation contracts; event adapters supply the authoritative observations. */
export type ApplicationTodo={label:string;message:string;target:string;blocking:boolean}
export type ApplicationClubSummary={
 state:'registered'|'known'|'new'|'ambiguous';label:string;detail:string
 entries:{id:string;label:string;status:string}[]
}
export const applicationPersonTarget=(key:string)=>`application-person-${encodeURIComponent(key)}`
export const applicationEntryTarget=(key:string)=>`application-entry-${encodeURIComponent(key)}`

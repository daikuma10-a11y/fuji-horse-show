/** Neutral presentation contracts; event adapters supply the authoritative observations. */
export type ApplicationIssueField='choice'|'name'|'reading'|'jef'|'checked'|'grade'|'sportsMember'|'instructorMember'|'qualified'|'horseGrade'|'competition'|'rider'|'horse'|'op'|'fee'
export type ApplicationTodo={label:string;message:string;target:string;blocking:boolean;fields?:ApplicationIssueField[]}
export type ApplicationClubSummary={
 state:'registered'|'known'|'new'|'ambiguous';label:string;detail:string
 entries:{id:string;label:string;status:string}[]
}
export const applicationPersonTarget=(key:string)=>`application-person-${encodeURIComponent(key)}`
export const applicationEntryTarget=(key:string)=>`application-entry-${encodeURIComponent(key)}`

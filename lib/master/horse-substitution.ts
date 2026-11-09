export type HorseChoice = {id:string;kind:'event'|'roster';name:string;number:string|null}
export type SubstitutionEntry = {id:string;competition:string;rider:string;position:number;billTo:string;oldFee:number;membership:string|null;instructor:boolean;op:boolean}
export type HorseEdit = Pick<SubstitutionEntry,'id'|'competition'|'membership'|'instructor'|'op'>
export type HorseOptions = {choices:HorseChoice[];entries:SubstitutionEntry[]}
export type HorseQuote = {old:string;new:string;number:string|null;late:boolean;oldCount:number;newCount:number;registration:number;
  entries:(SubstitutionEntry & {to:string;newFee:number;service:number})[];
  billing:{billTo:string;difference:number;registration:number;service:number;beforeTotal:number;afterTotal:number;beforeRemaining:number;afterRemaining:number}[]}
export type SwapInput = {old:string;target:HorseChoice;rows:HorseEdit[]}
export class UncertainSubstitution extends Error {}

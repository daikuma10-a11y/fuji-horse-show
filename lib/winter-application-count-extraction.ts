import type {ApplicationEntryCount,Origin} from './master/application'
import type {InputSheet} from './master/xlsx-input'

const normalized=(s:string)=>s.normalize('NFKC').replace(/[\s　]/g,'')
/** Count cells in the supplied Winter form; never infer entries from these numbers. */
export function extractWinterEntryCount(sheet:InputSheet,start:number,row:number,competition:string,jump:boolean,horseKeys:string[]):ApplicationEntryCount|null{
 const value=(cell:string)=>sheet.cells[cell]?.value??''
 // Older layouts/checkpoints without the supplied count columns remain readable.
 if(normalized(value(`${jump?'O':'K'}${start}`))!=='料金'||normalized(value(`W${start}`))!=='小計')return null
 const membership=['5','25'].includes(competition)?'sportsMember':['8','32'].includes(competition)?'instructorMember':undefined
 const numberRow=membership?row+1:row
 const origin=(col:string):Origin=>{const cell=col+numberRow,c=sheet.cells[cell];return {sheet:sheet.name,cell,value:c?.value??'',...(c?.formula?{formula:c.formula}:{})}}
 const buckets:ApplicationEntryCount['buckets']=membership
  ?jump?[{kind:'nonmember',origin:origin('Q')},{kind:'member',origin:origin('U')}]:[{kind:'nonmember',origin:origin('M')},{kind:'member',origin:origin('Q')},{kind:'op',origin:origin('U')}]
  :[{kind:'regular',origin:origin(jump?'Q':'M')},{kind:'op',origin:origin('U')}]
 return {key:`${sheet.name}!C${row}`,block:`${sheet.name}!${start}`,competition,horseKeys:[...new Set(horseKeys.filter(Boolean))],entryKeys:[],...(membership?{membership}:{}),buckets}
}

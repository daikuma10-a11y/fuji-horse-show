export type ReadingListRow = {
  id: string
  name: string
  reading: string
  organizations: string[]
  number: string
}
export type ReadingList = { riders: ReadingListRow[]; horses: ReadingListRow[] }

const ja=new Intl.Collator('ja',{sensitivity:'variant'})
const kanaKey=(text:string)=>text.normalize('NFKC').replace(/[\s　]+/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))

export function compareReadingRows(a:ReadingListRow,b:ReadingListRow){
  const first=kanaKey(a.reading),second=kanaKey(b.reading)
  return Number(!first)-Number(!second)||ja.compare(first,second)||ja.compare(a.name,b.name)||a.id.localeCompare(b.id)
}

type ClubRows={name:string;riders:ReadingListRow[];horses:ReadingListRow[]}
export function readingListByClub(list:ReadingList,compareClubs:(a:{name:string},b:{name:string})=>number){
  const clubs=new Map<string,ClubRows>()
  for(const kind of ['riders','horses'] as const){
    for(const row of list[kind]){
      for(const name of new Set(row.organizations.length?row.organizations:[''])){
        const club=clubs.get(name)??{name,riders:[],horses:[]}
        club[kind].push(row);clubs.set(name,club)
      }
    }
  }
  for(const club of clubs.values()){
    club.riders.sort(compareReadingRows)
    club.horses.sort(compareReadingRows)
  }
  return [...clubs.values()].sort((a,b)=>Number(!a.name)-Number(!b.name)||compareClubs(a,b))
}

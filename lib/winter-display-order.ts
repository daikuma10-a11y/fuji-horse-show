import { compareRosterMembers, kanaSortKey as normalize } from './master/roster-order'
import preparation from '../config/winter-2026-preparation.json'
import clubReadings from '../config/winter-organization-sort.json'
type CompetitionLabel={competition_no:string;name:string}
type NamedOrganization={name:string;reading?:string|null}
const readings=new Map(Object.entries(clubReadings).map(([name,reading])=>[normalize(name),reading]))
const positions=new Map(preparation.competitions.map((c,index)=>[c.number,index]))
const alphabet:Record<string,string>={a:'えー',b:'びー',c:'しー',d:'でぃー',e:'いー',f:'えふ',g:'じー',h:'えいち',i:'あい',j:'じぇー',k:'けー',l:'える',m:'えむ',n:'えぬ',o:'おー',p:'ぴー',q:'きゅー',r:'あーる',s:'えす',t:'てぃー',u:'ゆー',v:'ぶい',w:'だぶりゅー',x:'えっくす',y:'わい',z:'ぜっと'}
const key=(org:NamedOrganization)=>normalize(org.reading?.trim()||readings.get(normalize(org.name))||org.name).replace(/^[a-z]/,c=>alphabet[c])
export function compareWinterOrganizations(a:NamedOrganization,b:NamedOrganization){return key(a).localeCompare(key(b),'ja',{sensitivity:'base'})||a.name.localeCompare(b.name,'ja')}
export function compareWinterCompetitions(a:CompetitionLabel,b:CompetitionLabel){return (positions.get(a.competition_no)??Number.MAX_SAFE_INTEGER)-(positions.get(b.competition_no)??Number.MAX_SAFE_INTEGER)||a.competition_no.localeCompare(b.competition_no,'ja',{numeric:true})}
export function winterCompetitionLabel(c:CompetitionLabel){return `第${c.competition_no}競技 ${c.name.normalize('NFKC').replace(/\s+/g,' ').trim()}`}

/** Event-facing labels only. Registration snapshots and billing keep their saved names and IDs. */
export function winterAffiliatedOrganizations<T extends {id:string; name:string}>(data: {
  organizations: T[]; affiliationNames?: Record<string,string>
}): T[] {
  const names = data.affiliationNames

  return data.organizations.map(org => names?.[org.id] ? {...org, name:names[org.id]} : org)
    .sort(compareWinterOrganizations)
}

type PickerMember = {id:string; name:string; organization_id:string; reading?:string; pickerRank?:number}
export function winterPickerOrder(organizations: {id:string;name:string}[], readings = new Map<string,string>()) {
  const positions = new Map([...organizations].sort((a,b) => compareWinterOrganizations(a,b) || a.id.localeCompare(b.id)).map((org,index) => [org.id,index]))
  return (a:PickerMember,b:PickerMember) =>
    (positions.get(a.organization_id) ?? Infinity) - (positions.get(b.organization_id) ?? Infinity)
    || compareRosterMembers(readings.has(a.id) ? {...a,reading:readings.get(a.id)} : a,
      readings.has(b.id) ? {...b,reading:readings.get(b.id)} : b)
}

/** Multiple affiliations stay on the candidate. The first displayed club determines its position. */
export function sortWinterCandidates<T extends {id:string;name:string;reading:string;clubs:string[]}>(rows:T[]) {
  const compareClubNames=(a:string,b:string)=>compareWinterOrganizations({name:a},{name:b})
  return rows.map(row=>({...row,clubs:[...row.clubs].sort(compareClubNames)})).sort((a,b)=>{
    const first=a.clubs[0],second=b.clubs[0]
    return (first && second ? compareClubNames(first,second) : Number(!!second)-Number(!!first)) || compareRosterMembers(a,b)
  })
}

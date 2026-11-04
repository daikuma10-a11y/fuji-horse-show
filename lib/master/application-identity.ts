import type {ApplicationPerson} from './application'

/** Names/readings are suggestions, not unique identities. A nonempty JEF number is unique per kind, including archived records. */
export function newApplicationIdentityIssue(person:Pick<ApplicationPerson,'kind'|'name'|'jef'>,entities:readonly {kind:'rider'|'horse';jef_number:string|null}[]){
 const number=person.jef.trim()
 return number&&entities.some(e=>e.kind===person.kind&&e.jef_number===number)?`${person.name}：同じ日馬連番号の登録があるため、新規登録できません。番号と既存の人馬を確認してください`:''
}

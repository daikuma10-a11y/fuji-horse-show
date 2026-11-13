/** Native select headings, using the order and eligible member IDs supplied by the event adapter. */
export function RosterOptions({members,groups}:{members:readonly {id:string;name:string;organization_id:string}[];groups:readonly {id:string;name:string}[]}){
  const byClub=new Map<string,typeof members[number][]>()
  for(const member of members){
    const rows=byClub.get(member.organization_id)??[]
    rows.push(member)
    byClub.set(member.organization_id,rows)
  }
  return <>{groups.map(group=>{
    const items=byClub.get(group.id)
    return items&&<optgroup key={group.id} label={group.name}>{items.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</optgroup>
  })}</>
}

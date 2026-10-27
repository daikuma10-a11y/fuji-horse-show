/** Split explicit rider separators, never spaces inside a person's name. */
export function splitApplicationRiders(raw:string,knownNames:string[]){
 const normalize=(s:string)=>s.normalize('NFKC').replace(/[\s　]/g,'').toLocaleLowerCase('ja')
 function rider(text:string){
  const value=text.trim().normalize('NFKC')
  const bracket=/^\((.*)\)$/.exec(value)
  const suffix=/^(.*?)\s*(?:=|:|：)\s*OP$/i.exec(value)
  const prefix=/^OP\s*(?:=|:|：)\s*(.+)$/i.exec(value)
  return {name:(bracket?.[1]??suffix?.[1]??prefix?.[1]??value).trim(),op:!!(bracket||suffix||prefix),raw:text.trim()}
 }
 const known=new Set(knownNames.map(normalize))
 return raw.split(/\r?\n/).filter(x=>x.trim()).flatMap(line=>{
  const whole=rider(line)
  // A roster name can itself contain a middle dot (for example a foreign name).
  if(known.has(normalize(whole.name)))return [whole]
  return line.split(/[・･、,;；／/]+/).filter(x=>x.trim()).map(rider)
 })
}

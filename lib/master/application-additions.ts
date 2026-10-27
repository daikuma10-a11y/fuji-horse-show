import type {Application,ApplicationPerson,ApplicationEntry,Origin} from './application'

export const manualApplicationOrigin=():Origin=>({sheet:'画面で追加',cell:'A1',value:''})
export function addApplicationPerson(app:Application,kind:ApplicationPerson['kind'],id:string):Application{
 if(app.people.length>=50)throw new Error('人馬の合計は50件までです。別の申込書に分けてください。')
 const person:ApplicationPerson={key:`manual-person-${id}`,added:true,kind,name:'',reading:'',jef:'',grade:'',checked:false,sportsMember:'',instructorMember:'',qualified:false,origin:manualApplicationOrigin()}
 if(app.people.some(p=>p.key===person.key))throw new Error('追加する人馬の番号が重複しています')
 return {...app,people:[...app.people,person]}
}
export function addApplicationEntry(app:Application,id:string,sourceKey?:string):Application{
 if(app.entries.length>=5000)throw new Error('出番は5000件までです')
 const source=sourceKey?app.entries.find(e=>e.key===sourceKey):undefined
 if(sourceKey&&!source)throw new Error('追加元の出番を確認できません')
 const entry:ApplicationEntry={key:`manual-entry-${id}`,added:true,...(source?{sourceKey:source.key}:{}),competition:source?.competition??'',horse:source?.horse??'',rider:'',op:false,rawRider:'',rawHorse:'',origin:manualApplicationOrigin()}
 if(app.entries.some(e=>e.key===entry.key))throw new Error('追加する出番の番号が重複しています')
 const entries=[...app.entries],index=source?entries.findIndex(e=>e.key===source.key)+1:entries.length
 entries.splice(index,0,entry)
 return {...app,entries}
}
export function removeApplicationAddition(app:Application,key:string):Application{
 const person=app.people.find(p=>p.key===key&&p.added)
 if(person)return {...app,people:app.people.filter(p=>p.key!==key),entries:app.entries.map(e=>e.rider===key||e.horse===key?{...e,[person.kind]:''}:e)}
 if(!app.entries.some(e=>e.key===key&&e.added))throw new Error('画面で追加した行だけ削除できます')
 return {...app,entries:app.entries.filter(e=>e.key!==key).map(e=>{if(e.sourceKey!==key)return e;const {sourceKey:_,...rest}=e;return rest})}
}

import {NextResponse} from 'next/server'
import {compareRosterMembers} from '@/lib/master/roster-order'
import {receptionProxy} from '@/lib/winter-reception-proxy'

export const dynamic='force-dynamic'
export async function GET(){
  try{
    const {members}=await receptionProxy('picker-members','')
    const ids=members.sort(compareRosterMembers).map((member:{id:string})=>member.id)
    return NextResponse.json({ids},{headers:{'Cache-Control':'no-store'}})
  }catch{
    return NextResponse.json({error:'人馬の表示順を取得できません'},{status:503,headers:{'Cache-Control':'no-store'}})
  }
}

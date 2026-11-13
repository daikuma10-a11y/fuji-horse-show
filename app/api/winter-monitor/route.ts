import {NextResponse} from 'next/server'
import {receptionProxy} from '@/lib/winter-reception-proxy'

export const dynamic='force-dynamic'
export async function GET(){
 try{
  const {entryIds}=await receptionProxy('monitor-withdrawals','')
  if(!Array.isArray(entryIds)||entryIds.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw new Error()
  return NextResponse.json({entryIds},{headers:{'Cache-Control':'no-store'}})
 }catch{
  return NextResponse.json({error:'表示中の競技の棄権情報を確認できません'},{status:503,headers:{'Cache-Control':'no-store'}})
 }
}

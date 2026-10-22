"use client"
import {useMemo,useState} from 'react'
import type {loadWinterData} from '@/lib/winter-data'
import {winterRegistrationOverview} from '@/lib/winter-registration-overview'
import {MasterRegistrationOverview} from '@/components/master/registration-overview'

export function WinterRegistrationOverview({data,loading=false,error=''}:{data:Awaited<ReturnType<typeof loadWinterData>>|null;loading?:boolean;error?:string}){
 const[selectedId,setSelectedId]=useState('')
 const view=useMemo(()=>{
  try{return {groups:data?winterRegistrationOverview(data):[],error:''}}
  catch(reason){return {groups:[],error:reason instanceof Error?reason.message:'登録内容を確認できません'}}
 },[data])
 return <MasterRegistrationOverview groups={view.groups} selectedId={selectedId} onSelect={setSelectedId} loading={loading||!data&&!error} error={error||view.error}/>
}

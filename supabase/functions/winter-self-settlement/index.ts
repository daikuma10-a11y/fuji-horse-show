declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void}
const EVENT='b571f05e-ed23-4e07-929e-be2b73e601a5'
// Dedicated Winter preview proxy authentication; no browser gets this credential.
const PROXY_HASH='5b1f1bf8bce78ab09711c1d819dcffaa6b9a0a90ef59284ac08538260f2e9486'
const sha=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req:Request)=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
 try{
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  const body=await req.json()
  if(typeof body.proxySecret!=='string'||await sha(body.proxySecret)!==PROXY_HASH)return json({error:'Unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const rest=async(path:string,options:RequestInit={})=>{const response=await fetch(`${url}/rest/v1/${path}`,{...options,signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers}});const data=await response.json().catch(()=>null);if(!response.ok){const error=new Error(data?.message||'精算内容を取得できません') as Error&{uncertain?:boolean};error.uncertain=response.status>=500;throw error;}return data}
  if(body.action==='picker-members'){
   // Only current event IDs and their sort keys may reach the authenticated frontend server.
   const pages=async<T>(table:string,select:string,order:string,filters:Record<string,string>={})=>{
    const rows:T[]=[]
    for(let offset=0;;offset+=500){
     const query=new URLSearchParams({...filters,select,order,limit:'500',offset:String(offset)})
     const page:T[]=await rest(table+'?'+query)
     rows.push(...page)
     if(page.length<500)return rows
    }
   }
   type Member={id:string;name:string;roster_source:string|null;is_participant:boolean|null}
   const event={event_id:'eq.'+EVENT}
   const [riders,horses,participants,bindings]=await Promise.all([
    pages<Member>('riders','id,name,is_participant,roster_source','id.asc',event),
    pages<Member>('horses','id,name,is_participant,roster_source','id.asc',event),
    pages<{entity_id:string;club_id:string;reading_snapshot:string;fhs_roster_entities:{reading:string}}>(
     'fhs_winter_participants','entity_id,club_id,reading_snapshot,fhs_roster_entities(reading)','entity_id.asc,club_id.asc',event),
    pages<{entity_id:string;club_id:string;rider_id:string|null;horse_id:string|null}>(
     'fhs_winter_reception_roster','entity_id,club_id,rider_id,horse_id','entity_id.asc,club_id.asc'),
   ])
   const byMembership=new Map(participants.map(p=>[p.entity_id+'/'+p.club_id,p.fhs_roster_entities?.reading?.trim()||p.reading_snapshot]))
   const byEventId=new Map(bindings.map(b=>[b.rider_id??b.horse_id,byMembership.get(b.entity_id+'/'+b.club_id)]))
   const members=[...riders,...horses].filter(row=>row.roster_source!=='winter-substituted'&&(row.roster_source!=='shared_roster'||row.is_participant===true))
   return json({members:members.map(row=>({id:row.id,name:row.name,reading:byEventId.get(row.id)||''}))})
  }
  if(body.action==='monitor-withdrawals'){
   const [monitor]=await rest(`fhs_winter_monitor?event_id=eq.${EVENT}&select=state&limit=1`)
   if(!monitor)return json({entryIds:[]})
   const groups=[monitor.state,...(monitor.state.followingCompetitions??[])]
   const ids=groups.map(group=>group.competitionId)
   if(ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw new Error('表示中の競技を確認できません')
   const from='in.('+ids.join(',')+')', sources=new Set<string>()
   for(const meeting of [false,true]){
    const path=meeting?'fhs_winter_meeting_requests':'reception_requests'
    const prefix=meeting?'reception_requests.':''
    const select=meeting?'reception_requests!inner(original_entry_id,entry_id,from_competition_id,request_type)':'original_entry_id,from_competition_id'
    for(let offset=0;;offset+=500){
     const query=new URLSearchParams({event_id:'eq.'+EVENT,select,order:meeting?'request_id.asc':'id.asc',limit:'500',offset:String(offset),
      [prefix+'status']:'eq.reflected',[prefix+'request_type']:meeting?'in.(withdraw,change)':'eq.withdraw',[prefix+'from_competition_id']:from})
     if(meeting)query.set(prefix+'event_id','eq.'+EVENT)
     const page=await rest(path+'?'+query)
     for(const item of page){
      const row=meeting?item.reception_requests:item
      if(!meeting||row.request_type==='withdraw'||row.entry_id!==row.original_entry_id)sources.add(row.from_competition_id+'/'+row.original_entry_id)
     }
     if(page.length<500)break
    }
   }
   const entryIds:string[]=[]
   for(let offset=0;;offset+=500){
    const query=new URLSearchParams({event_id:'eq.'+EVENT,competition_id:from,or:'(status.ilike.withdrawn,status.ilike.wd)',select:'entry_id,competition_id,source',order:'entry_id.asc',limit:'500',offset:String(offset)})
    const rows=await rest('reception_entries?'+query)
    for(const row of rows)if(row.source!=='winter-initial-cancelled'&&sources.has(row.competition_id+'/'+row.entry_id))entryIds.push(row.entry_id)
    if(rows.length<500)break
   }
   return json({entryIds})
  }
  if(body.action==='public-setup'){
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('')
   await rest('fhs_winter_settlement_devices',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({token_hash:await sha(token),expires_at:new Date(Date.now()+12*3600000).toISOString()})})
   return json({token})
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'精算画面を開き直してください'},401)
  const hash=await sha(body.token)
  const devices=await rest(`fhs_winter_settlement_devices?token_hash=eq.${hash}&revoked=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`)
  if(devices.length!==1)return json({error:'有効期限が切れました。精算画面を開き直してください'},401)
  if(body.action==='reception-ready')return json({ready:true})
  if(body.action==='reception-offline')return json(await rest('rpc/receive_winter_offline_item',{method:'POST',body:JSON.stringify({p_receipt_id:body.receiptId,p_source:body.source,p_token_hash:hash})}))
  if(body.action==='reception-confirm')return json(await rest('rpc/submit_winter_public_reception_batch',{method:'POST',body:JSON.stringify({p_items:body.items,p_expected_total:body.total,p_visitor_name:body.name,p_token_hash:hash})}))
  if(body.action==='organizations'){
   const rows=[]
   for(let offset=0;;offset+=500){const page=await rest(`organizations?event_id=eq.${EVENT}&select=id,event_id,name&order=id.asc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)return json({organizations:rows})}
  }
  if(typeof body.org!=='string'||!/^[0-9a-f-]{36}$/i.test(body.org))return json({error:'団体を選択してください'},400)
  if(body.action==='history'){
   const records=await rest(`fhs_winter_settlement_confirmations?event_id=eq.${EVENT}&organization_key=eq.${body.org}&select=id,event_id,organization_key,account_version,payment_method,confirmer_name,account,created_at&order=created_at.desc,id.desc&limit=100`)
   return json({records})
  }
  if(body.action==='account'){
   const current=await rest('rpc/get_winter_settlement_account',{method:'POST',body:JSON.stringify({p_org:body.org})})
   const history=await rest(`fhs_winter_settlement_confirmations?event_id=eq.${EVENT}&organization_key=eq.${body.org}&select=id,event_id,organization_key,account_version,payment_method,confirmer_name,account,created_at&order=created_at.desc,id.desc&limit=1`)
   return json({...current,saved:history[0]??null})
  }
  if(body.action==='statement-scope'){
   const current=await rest('rpc/get_winter_settlement_account',{method:'POST',body:JSON.stringify({p_org:body.org})})
   const pages=async(table:string,select:string,filters:Record<string,string>)=>{
    const rows=[]
    for(let offset=0;;offset+=500){
     const query=new URLSearchParams({...filters,event_id:'eq.'+EVENT,select,order:'id.asc',limit:'500',offset:String(offset)})
     const page=await rest(table+'?'+query);if(!Array.isArray(page))throw new Error('明細の履歴を確認できません')
     rows.push(...page);if(page.length<500)return rows
    }
   }
   const [competitions,requests,onsite,payments,adjustments]=await Promise.all([
    pages('competitions','id,competition_date',{}),
    pages('reception_requests','id,target_competition_id,reflected_at',{organization_id:'eq.'+body.org,status:'eq.reflected'}),
    pages('fhs_winter_settlement_only','id,created_at,inputs',{organization_key:'eq.'+body.org}),
    pages('fhs_winter_extra_payments','id,created_at,amount,payment_method,reverses_id',{organization_key:'eq.'+body.org}),
    pages('fhs_winter_charge_adjustments','id,created_at',{organization_key:'eq.'+body.org}),
   ])
   const latest=await rest('rpc/get_winter_settlement_account',{method:'POST',body:JSON.stringify({p_org:body.org})})
   if(current.version!==latest.version)throw new Error('精算内容が更新されました。もう一度読み直してください。')
   const dates=new Map(competitions.map(row=>[row.id,row.competition_date]))
   const context={eventId:EVENT,orgId:body.org,dates:[...new Set(competitions.map(row=>row.competition_date))].sort(),
    sources:[...requests.map(row=>({id:row.id,date:dates.get(row.target_competition_id),at:row.reflected_at})),...onsite.map(row=>({id:row.id,date:dates.get(row.inputs.competitionId),at:row.created_at}))],
    payments:payments.map(row=>({id:row.id,at:row.created_at,amount:row.amount,method:row.payment_method,reversesId:row.reverses_id})),
    adjustments:adjustments.map(row=>({id:row.id,at:row.created_at})),
   }
   return json({account:current.account,version:current.version,context})
  }
  if(body.action==='confirm')return json({saved:await rest('rpc/confirm_winter_settlement',{method:'POST',body:JSON.stringify({p_id:body.id,p_org:body.org,p_version:body.version,p_method:body.method,p_name:body.name,p_token_hash:hash})})})
  return json({error:'Unknown action'},400)
 }catch(e){return json({error:e instanceof Error?e.message:'処理に失敗しました',uncertain:!!(e as {uncertain?:boolean})?.uncertain||(e instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(e.name))},409)}
})

export {}

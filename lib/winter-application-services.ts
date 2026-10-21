import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {loadSharedRoster,loadWinterRosterBindings,saveRosterEntity,saveWinterParticipants} from './shared-roster'
import {loadWinterData} from './winter-data'
import {loadWinterInitialCharges} from './winter-settlement'
import {saveWinterInitialEntry} from './winter-initial-entry'
import type {ApplicationRegistrationServices} from './winter-application-registration'

/** Reuse existing admin authorization and RPCs. No new DB or payment persistence path. */
export function winterApplicationServices(session:AdminSession,onSession:(value:AdminSession)=>void):ApplicationRegistrationServices{
 let current=session
 async function verified(){current=await verifyAdminSession(current);onSession(current);return current.accessToken}
 return {
  load:async()=>{
   const token=await verified()
   const [roster,bindings,data,initial]=await Promise.all([loadSharedRoster(token),loadWinterRosterBindings(token),loadWinterData(),loadWinterInitialCharges(token)])
   return {roster,bindings,data,initial}
  },
  savePerson:async input=>saveRosterEntity(input,await verified()),
  saveParticipants:async(clubId,ids,expected)=>saveWinterParticipants(clubId,ids,expected,await verified()),
  saveEntry:async input=>saveWinterInitialEntry(input,await verified()),
 }
}

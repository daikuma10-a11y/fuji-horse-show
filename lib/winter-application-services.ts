import {loadWinterApplicationCredentials,saveWinterApplicationCredential} from './winter-application-credentials'
import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {loadSharedRoster,loadWinterRosterBindings,saveRosterEntity,saveWinterParticipants} from './shared-roster'
import {loadWinterData} from './winter-data'
import {loadWinterInitialCharges} from './winter-settlement'
import {saveWinterInitialEntry} from './winter-initial-entry'
import type {ApplicationRegistrationServices} from './winter-application-registration'

/** Verify admin before every operation; credential persistence is Winter-only and never writes payments. */
export function winterApplicationServices(session:AdminSession,onSession:(value:AdminSession)=>void):ApplicationRegistrationServices{
 let current=session
 async function verified(){current=await verifyAdminSession(current);onSession(current);return current.accessToken}
 return {
  load:async()=>{
   const token=await verified()
   const [roster,bindings,data,initial,credentials]=await Promise.all([loadSharedRoster(token),loadWinterRosterBindings(token),loadWinterData(),loadWinterInitialCharges(token),loadWinterApplicationCredentials(token)])
   return {roster,bindings,data,initial,credentials}
  },
  savePerson:async input=>saveRosterEntity(input,await verified()),
  saveParticipants:async(clubId,ids,expected)=>saveWinterParticipants(clubId,ids,expected,await verified()),
  saveCredential:async input=>saveWinterApplicationCredential(input,await verified()),
  saveEntry:async input=>saveWinterInitialEntry(input,await verified()),
 }
}

import {loadWinterApplicationCredentials,saveWinterApplicationCredential} from './winter-application-credentials'
import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {loadSharedRoster,loadWinterRosterBindings,saveRosterEntity,saveWinterParticipants} from './shared-roster'
import {loadWinterData} from './winter-data'
import {loadWinterInitialCharges} from './winter-settlement'
import {saveWinterInitialEntry} from './winter-initial-entry'
import {loadJefRiderQualifications} from './jef-rider-qualifications'
import type {ApplicationRegistrationServices} from './winter-application-registration'

/** Verify admin before every operation; credential persistence is Winter-only and never writes payments. */
export function winterApplicationServices(session:AdminSession,onSession:(value:AdminSession)=>void):ApplicationRegistrationServices{
 let current=session
 async function verified(){current=await verifyAdminSession(current);onSession(current);return current.accessToken}
 return {
  load:async(riderNumbers)=>{
   const token=await verified()
   const [roster,bindings,data,initial,credentials,grades]=await Promise.all([loadSharedRoster(token),loadWinterRosterBindings(token),loadWinterData(),loadWinterInitialCharges(token),loadWinterApplicationCredentials(token),riderNumbers?loadJefRiderQualifications(riderNumbers,token).then(riderGrades=>({riderGrades})).catch(()=>({riderGrades:[],riderGradesError:'日馬連の資格データを取得できません。「既存登録を再確認」で再読込するか、申込書の資格を確認してください。'})):Promise.resolve({})])
   return {roster,bindings,data,initial,credentials,...grades}
  },
  savePerson:async input=>saveRosterEntity(input,await verified()),
  saveParticipants:async(clubId,ids,expected)=>saveWinterParticipants(clubId,ids,expected,await verified()),
  saveCredential:async input=>saveWinterApplicationCredential(input,await verified()),
  saveEntry:async input=>saveWinterInitialEntry(input,await verified()),
 }
}

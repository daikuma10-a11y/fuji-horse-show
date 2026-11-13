import {FittedName} from './master/fitted-name'
import {MasterMonitorDay} from './master/monitor-day'
import type { WinterMonitorState, WinterMonitorCompetition } from '@/lib/winter-monitor'
import { WINTER_EVENT_NAME, winterTimetableSection } from '@/lib/winter-event'
export function WinterMonitorView({state,compact=false}:{state:WinterMonitorState;compact?:boolean}){
 if (state.followingCompetitions !== undefined) {
  const date = new Date(state.date+'T00:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'})
  return <MasterMonitorDay title={`${WINTER_EVENT_NAME}　${date} 出番表`} compact={compact}>
   {[state,...state.followingCompetitions].map(group=><MonitorCompetition key={group.competitionId} state={group} compact={compact} daily/>)}
  </MasterMonitorDay>
 }
 return <MonitorCompetition state={state} compact={compact} daily={false}/>
}

function MonitorCompetition({state,compact,daily}:{state:WinterMonitorCompetition;compact:boolean;daily:boolean}){
 const section = winterTimetableSection(state.competitionNo)
 const showInspection = section?.showInspection ?? true
 const fontSize = compact ? 12 : daily ? 18 : 20
 return <section data-monitor-competition={`第${state.competitionNo}競技 ${state.competitionName}`} className={`min-w-0 bg-white text-slate-950 ${compact?'p-2 text-xs':daily?'py-2 text-lg':'p-5 text-xl'}`}>{!daily&&<p className="font-bold">{WINTER_EVENT_NAME}</p>}<h2 className={compact?'text-sm font-bold':'mt-3 text-3xl font-bold'}>第{state.competitionNo}競技 {state.competitionName}</h2><p>{new Date(state.date+'T00:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'})}{section?.startListVenue && <>　会場：{section.startListVenue}</>}{showInspection && <>　下見 {state.inspectionTime??'未定'}</>}　開始 {state.startTime??'未定'} {state.timePhase==='final'?'（確定）':'（予定）'}</p>{(!daily||state.draft)&&<p>{!daily&&`${state.page+1}ページ`} {state.draft?'（調整中・未保存）':''}</p>}<table className="mt-2 w-full table-fixed border-collapse"><thead><tr><th className="w-[9%] border p-1">出番</th><th className="w-[24%] border p-1">選手</th><th className="w-[28%] border p-1">馬名</th><th className="border p-1">所属</th><th className="w-[9%] border p-1">OP</th></tr></thead><tbody>
  {(daily?state.rows:state.rows.slice(state.page*30,(state.page+1)*30)).map(row=>
   <tr key={row.id} className={row.mark==='追加'?'bg-green-100':row.mark?'bg-blue-100':''}>
    <td className="border p-1 text-center">{row.number}</td>
    <td className="border p-1"><FittedName name={row.rider} fontSize={fontSize} mark={row.mark}/></td>
    <td className="border p-1"><FittedName name={row.horse} fontSize={fontSize}/></td>
    <td className="border p-1"><FittedName name={row.organization} fontSize={fontSize}/></td>
    <td className="border p-1 text-center font-bold">{row.isOp?'OP':''}</td>
   </tr>)}
 </tbody></table>{!state.rows.length&&<p className="p-4">出番表が登録されると表示できます。</p>}</section>
}

import exercise from '@/config/winter-exercise.json'
export function WinterExerciseNotice({organizationId}:{organizationId:string}){
 if(!exercise.organizations.includes(organizationId))return null
 return <p className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4 text-lg font-semibold">架空データの操作テストです。クラブ01〜05の選手・馬は公認入力用の架空番号付き、クラブ06〜10は未登録です。この番号は実在する日馬連登録の証明ではありません。</p>
}

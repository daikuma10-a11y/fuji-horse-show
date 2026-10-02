import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exportOfficialExcel } from '@/lib/official-excel'
import { loadOfficialExcelEntries } from '@/lib/supabase-rest'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return Response.json({ error: '本部ログインが必要です' }, { status: 401 })
  try {
    const entries = await loadOfficialExcelEntries(token)
    const template = await readFile(join(process.cwd(), 'templates/autumn-1-10.xlsm'))
    const output = exportOfficialExcel(template, entries)
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    return new Response(Buffer.from(output), { headers: { 'Content-Type': 'application/vnd.ms-excel.sheet.macroEnabled.12', 'Content-Disposition': `attachment; filename="FujiHorseShow_1-10_${stamp}.xlsm"`, 'Cache-Control': 'no-store' } })
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : 'Excel出力に失敗しました'
    return Response.json({ error }, { status: error.includes('認証') ? 401 : 422 })
  }
}

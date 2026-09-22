const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey)

function headers(extra?: Record<string, string>, accessToken?: string) {
  if (!supabaseKey) return extra ?? {}
  return { apikey: supabaseKey, Authorization: `Bearer ${accessToken ?? supabaseKey}`, ...extra }
}

export async function supabaseRest<T>(table: string, query: string): Promise<T[]> {
  if (!supabaseUrl || !supabaseKey) return []
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, { headers: headers() })
  if (!response.ok) throw new Error(`Supabase ${table} request failed: ${response.status}`)
  return response.json() as Promise<T[]>
}

export async function supabaseInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured")
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(row),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase ${table} insert failed: ${response.status} ${detail}`)
  }
  const rows = (await response.json()) as T[]
  if (!rows[0]) throw new Error(`Supabase ${table} insert returned no row`)
  return rows[0]
}

export async function supabaseUpdate<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured")
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase ${table} update failed: ${response.status} ${detail}`)
  }
  return response.json() as Promise<T[]>
}

export async function supabaseRpc<T>(fn: string, args: Record<string, unknown>, accessToken: string): Promise<T> {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured")
  if (!accessToken) throw new Error("大会本部ログインが必要です")
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }, accessToken),
    body: JSON.stringify(args),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Supabase RPC ${fn} failed: ${response.status} ${detail}`)
  }
  return response.json() as Promise<T>
}

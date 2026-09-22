const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey)

export async function supabaseRest<T>(table: string, query: string): Promise<T[]> {
  if (!supabaseUrl || !supabaseKey) return []
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  })
  if (!response.ok) throw new Error(`Supabase ${table} request failed: ${response.status}`)
  return response.json() as Promise<T[]>
}

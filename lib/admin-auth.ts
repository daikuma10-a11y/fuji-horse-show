const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const STORAGE_KEY = "fhs_admin_session"

export interface AdminSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user?: { email?: string }
}

function requireConfig() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured")
}

export function loadAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as AdminSession
    if (!session.access_token || !session.expires_at || session.expires_at * 1000 <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

function saveAdminSession(session: AdminSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return session
}

export async function signInAdmin(email: string, password: string) {
  requireConfig()
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: supabaseKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  })
  if (!response.ok) throw new Error("メールアドレスまたはパスワードを確認してください")
  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } }
  return saveAdminSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in, user: data.user })
}

export function signOutAdmin() {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY)
}

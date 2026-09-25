/**
 * Supabase connection for multiplayer. Configured with VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY at build time; without them the app runs solo only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const multiplayerEnabled = supabase !== null
export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || null

export class ServerError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function client(): SupabaseClient {
  if (!supabase) throw new ServerError(503, "Multiplayer isn't set up on this site yet")
  return supabase
}

/** Signs in anonymously once per browser; later visits reuse the saved session. */
export async function ensureSignedIn(captchaToken?: string): Promise<string> {
  const db = client()
  const { data } = await db.auth.getSession()
  if (data.session) return data.session.user.id
  const res = await db.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)
  if (res.error || !res.data.user) throw new ServerError(401, res.error?.message ?? "Couldn't sign in. Reload and try again.")
  return res.data.user.id
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** Calls the `game` server function. Throws ServerError with the server's message. */
export async function callGame<T = Record<string, unknown>>(action: Record<string, unknown>): Promise<T> {
  const db = client()
  const { data } = await db.auth.getSession()
  let res: Response
  try {
    res = await fetch(`${url}/functions/v1/game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key!,
        Authorization: `Bearer ${data.session?.access_token ?? key}`,
      },
      body: JSON.stringify(action),
    })
  } catch {
    throw new ServerError(0, "Couldn't reach the game server. Check your connection.")
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ServerError(res.status, body.error ?? `The server answered with HTTP ${res.status}`)
  return body as T
}

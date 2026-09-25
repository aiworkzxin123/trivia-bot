/**
 * The one server function. Every change to a game goes through here:
 * POST { type: 'create' | 'join' | 'start' | 'submit' | ... , ...fields }
 *
 * The game rules live in ../_shared (copied from src/ by `npm run sync:functions`).
 */
import { createClient } from '@supabase/supabase-js'
import { loadQuestionsForSettings } from '../_shared/server/questions.ts'
import { GameError, handleAction } from '../_shared/server/service.ts'
import { SupabaseStore } from '../_shared/server/supabaseStore.ts'

const QUESTIONS_URL = Deno.env.get('QUESTIONS_URL') ?? 'https://aiworkzxin123.github.io/trivia-bot/questions/opentdb.json'

// GAME_SERVICE_KEY is set by scripts/setup-supabase.sh; the built-in variable is the fallback.
const serviceKey = Deno.env.get('GAME_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
  auth: { persistSession: false },
})
const store = new SupabaseStore(admin)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function userIdFrom(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request body must be JSON' }, 400)
  }

  try {
    const userId = await userIdFrom(req)
    const result = await handleAction(
      { store, now: Date.now, loadQuestions: (settings) => loadQuestionsForSettings(settings, QUESTIONS_URL) },
      userId,
      body,
    )
    return json(result)
  } catch (err) {
    if (err instanceof GameError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Something went wrong on the server. Try again.' }, 500)
  }
})

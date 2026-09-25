/**
 * End-to-end check against the real Supabase project: a host and a guest play
 * through games while the script checks scoring, timing and what each player
 * can and can't read.
 *
 * Run with: SUPABASE_SECRET_KEY=... npm run smoke
 * (the secret key is only used to look up correct answers, like a cheater never could)
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local.
 */
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!SECRET) throw new Error('Set SUPABASE_SECRET_KEY')

let failures = 0
function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`)
  if (!ok) failures++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function player() {
  const db = createClient(URL_, KEY, { auth: { persistSession: false } })
  const { data, error } = await db.auth.signInAnonymously()
  if (error) throw error
  const token = data.session!.access_token
  async function call(action: Record<string, unknown>) {
    const res = await fetch(`${URL_}/functions/v1/game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(action),
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body: body as Record<string, any> }
  }
  return { db, call, userId: data.user!.id }
}

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })

async function gameRow(db: SupabaseClient, gameId: string) {
  return (await db.from('games').select().eq('id', gameId).single()).data as Record<string, any>
}
async function waitForStart(db: SupabaseClient, gameId: string) {
  const g = await gameRow(db, gameId)
  await sleep(Math.max(0, new Date(g.question_started_at).getTime() - Date.now()) + 400)
  return g
}
async function secretAnswer(gameId: string, idx: number) {
  const q = (await admin.from('questions').select('id, question_secrets(answer)').eq('game_id', gameId).eq('idx', idx).single()).data as any
  const s = Array.isArray(q.question_secrets) ? q.question_secrets[0] : q.question_secrets
  return { questionId: q.id as string, answer: (s.answer as string).replace(/\s*\[.*$/, '') }
}

async function classicGame() {
  console.log('\nClassic game, host + guest')
  const host = await player()
  const guest = await player()
  const created = await host.call({
    type: 'create',
    nickname: 'Host',
    interests: ['music', 'cycling'],
    settings: { format: 'classic', categories: ['Geography'], count: 5, timeLimitSec: 20, difficulty: 'medium' },
  })
  check(created.status === 200 && /^[A-Z]{5}$/.test(created.body.code), 'host creates a game with a 5-letter code', created)
  const { gameId, code } = created.body
  const joined = await guest.call({ type: 'join', code: code.toLowerCase(), nickname: 'Guest', interests: ['cycling'] })
  check(joined.status === 200, 'guest joins with a lowercase code', joined)
  check((await guest.call({ type: 'join', code, nickname: 'GUEST' })).status === 200, 'joining twice returns the same player')

  const other = await player()
  check((await other.call({ type: 'join', code, nickname: 'host' })).status === 409, 'a taken name is refused (any case)')

  check((await guest.call({ type: 'suggestions', gameId })).status === 403, 'guest cannot see suggestions')
  const sugg = await host.call({ type: 'suggestions', gameId })
  check(JSON.stringify(sugg.body.interests) === '["cycling"]', 'host sees only the interest 2 players share', sugg.body)

  // Row level security from the guest's side.
  const secrets = await guest.db.from('question_secrets').select()
  check(!secrets.data?.length, 'guest cannot read question secrets', secrets)
  const interests = await guest.db.from('player_interests').select()
  check(!interests.data?.length, 'guest cannot read interests', interests)
  const write = await guest.db.from('games').update({ status: 'finished' }).eq('id', gameId).select()
  check(!write.data?.length, 'guest cannot change the game directly', write)
  const scoreHack = await guest.db.rpc('record_answer', {})
  check(Boolean(scoreHack.error), 'guest cannot call the scoring function', scoreHack.data)
  const strangerRead = await other.db.from('games').select().eq('id', gameId)
  check(!strangerRead.data?.length, 'someone not in the game cannot read it')

  check((await guest.call({ type: 'start', gameId })).status === 403, 'guest cannot start the game')
  const started = await host.call({ type: 'start', gameId })
  check(started.status === 200 && started.body.questionCount === 5, 'host starts with 5 questions', started)
  check(!(await admin.from('player_interests').select().eq('game_id', gameId)).data?.length, 'interests are deleted at the start')

  const early = await guest.db.from('questions').select().eq('game_id', gameId)
  check(!early.data?.length, 'question is not readable during the countdown', early.data)
  await waitForStart(guest.db, gameId)
  const q0 = (await guest.db.from('questions').select().eq('game_id', gameId).eq('idx', 0).single()).data as any
  check(Boolean(q0?.text) && q0.revealed_answer === null, 'question readable after the start, answer still hidden', q0)
  const q1 = await guest.db.from('questions').select().eq('game_id', gameId).eq('idx', 1)
  check(!q1.data?.length, 'next question is not readable yet')

  // Five identical correct answers at once: only one may count.
  const { answer } = await secretAnswer(gameId, 0)
  const burst = await Promise.all(Array.from({ length: 5 }, () => guest.call({ type: 'submit', gameId, answer })))
  const ok = burst.filter((r) => r.status === 200)
  check(ok.length === 1 && ok[0].body.result === 'correct', 'five simultaneous correct answers score once', burst.map((r) => r.status))
  const guestRow = (await guest.db.from('players').select().eq('game_id', gameId).eq('nickname', 'Guest').single()).data as any
  check(guestRow.score === ok[0]?.body.points && guestRow.score > 1000, `guest score ${guestRow.score} includes the first-correct bonus`, guestRow.score)

  const feed = (await host.db.from('feed_events').select().eq('game_id', gameId)).data ?? []
  check(feed.length === 1 && !JSON.stringify(feed).toLowerCase().includes(answer.toLowerCase()), 'feed shows who got it, not the answer', feed)

  const hostAnswers = await guest.db.from('answers').select().eq('game_id', gameId).neq('player_id', guestRow.id)
  check(!hostAnswers.data?.length, "guest cannot read the host's answers before the reveal")

  // Host answers wrong twice: everyone is done, so the question ends early.
  await host.call({ type: 'submit', gameId, answer: 'zzzz wrong one' })
  const second = await host.call({ type: 'submit', gameId, answer: 'zzzz wrong two' })
  check(second.body.result === 'wrong' && second.body.attemptsLeft === 0, 'host uses both tries', second.body)
  await sleep(300)
  const afterEarly = await gameRow(guest.db, gameId)
  check(afterEarly.status === 'reveal', 'question ends early when everyone is done', afterEarly.status)
  const revealed = (await guest.db.from('questions').select().eq('game_id', gameId).eq('idx', 0).single()).data as any
  check(Boolean(revealed.revealed_answer), 'answer readable after the reveal')
  const visible = await guest.db.from('answers').select().eq('game_id', gameId)
  check((visible.data?.length ?? 0) >= 3, "everyone's answers readable after the reveal")

  // Host accepts one of their own wrong answers, twice at once: only once may count.
  const wrong = (await host.db.from('answers').select().eq('game_id', gameId).eq('verdict', 'wrong')).data as any[]
  const overrides = await Promise.all([...wrong, ...wrong].map((a) => host.call({ type: 'override', gameId, answerId: a.id })))
  check(overrides.filter((r) => r.status === 200).length === 1, 'simultaneous overrides apply once', overrides.map((r) => r.status))
  check((await guest.call({ type: 'next', gameId })).status === 403, 'guest cannot move to the next question')

  // Play out the rest: both answer wrong twice, host moves on.
  for (let i = 1; i < 5; i++) {
    check((await host.call({ type: 'next', gameId })).status === 200, `host opens question ${i + 1}`)
    await waitForStart(guest.db, gameId)
    for (const p of [host, guest]) {
      await p.call({ type: 'submit', gameId, answer: 'qqq nope' })
      await p.call({ type: 'submit', gameId, answer: 'qqq nope again' })
    }
    await sleep(300)
  }
  const done = await host.call({ type: 'next', gameId })
  check(done.body.status === 'finished', 'game finishes after the last question', done.body)
  return gameId
}

async function tossupGame() {
  console.log('\nTossup game')
  const host = await player()
  const created = await host.call({
    type: 'create',
    nickname: 'Host',
    settings: { format: 'tossup', categories: ['History'], count: 5, timeLimitSec: 20, difficulty: 'medium' },
  })
  const { gameId } = created.body
  const started = await host.call({ type: 'start', gameId })
  check(started.status === 200, 'tossup game starts with QBReader questions', started)
  await waitForStart(host.db, gameId)
  const q = (await host.db.from('questions').select().eq('game_id', gameId).eq('idx', 0).single()).data as any
  check(q.text === '' && q.source_note === null && q.word_count > 20, 'tossup text and set name hidden, word count known', q)
  const first = (await host.db.from('question_chunks').select().eq('question_id', q.id)).data ?? []
  await sleep(3000)
  const later = (await host.db.from('question_chunks').select().eq('question_id', q.id)).data ?? []
  const total = Math.ceil(q.word_count / 3)
  check(first.length >= 1 && first.length <= 2, `about 1 chunk readable at the start (${first.length} of ${total})`)
  check(later.length > first.length && later.length < total, `more chunks readable 3 seconds later (${later.length} of ${total})`)

  const wrong = await host.call({ type: 'submit', gameId, answer: 'definitely not it' })
  check(wrong.body.result === 'wrong' && wrong.body.points === -50 && wrong.body.attemptsLeft === 0, 'wrong tossup answer costs 50 and ends your turn', wrong.body)
  await sleep(300)
  const after = (await host.db.from('questions').select().eq('game_id', gameId).eq('idx', 0).single()).data as any
  check(after.text.length > 50 && Boolean(after.source_note) && Boolean(after.revealed_answer), 'full text, set name and answer readable after the reveal', after)
  return gameId as string
}

async function cleanup() {
  console.log('\nCleanup')
  const res = await fetch(`${URL_}/functions/v1/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ type: 'cleanup' }),
  })
  check(res.status === 401, 'cleanup without the secret key is refused', res.status)
}

async function main() {
  const gameIds = [await classicGame(), await tossupGame()]
  await cleanup()
  // Remove the test games.
  await admin.from('games').delete().in('id', gameIds)
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

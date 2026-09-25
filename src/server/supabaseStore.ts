/** GameStore backed by Supabase, used by the server function with the service role key. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CodeTakenError, type GameStore } from './store.ts'
import type { AnswerRow, FeedEvent, GameRow, GameStatus, NewQuestion, PlayerRow, QuestionRow, QuestionSecret } from './types.ts'

type Row = Record<string, unknown>

const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null)
const iso = (v: number | null | undefined) => (v === null || v === undefined ? null : new Date(v).toISOString())

/** Throws on a database error. Single-row lookups may still return null, which callers check. */
function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export function toGame(r: Row): GameRow {
  return {
    id: r.id as string,
    code: r.code as string,
    hostId: r.host_id as string,
    status: r.status as GameStatus,
    settings: r.settings as GameRow['settings'],
    currentIndex: r.current_index as number,
    questionCount: r.question_count as number,
    questionStartedAt: ms(r.question_started_at),
    questionEndsAt: ms(r.question_ends_at),
    createdAt: ms(r.created_at)!,
  }
}

function fromGame(g: Partial<GameRow>): Row {
  const out: Row = {}
  if (g.code !== undefined) out.code = g.code
  if (g.hostId !== undefined) out.host_id = g.hostId
  if (g.status !== undefined) out.status = g.status
  if (g.settings !== undefined) out.settings = g.settings
  if (g.currentIndex !== undefined) out.current_index = g.currentIndex
  if (g.questionCount !== undefined) out.question_count = g.questionCount
  if (g.questionStartedAt !== undefined) out.question_started_at = iso(g.questionStartedAt)
  if (g.questionEndsAt !== undefined) out.question_ends_at = iso(g.questionEndsAt)
  if (g.createdAt !== undefined) out.created_at = iso(g.createdAt)
  return out
}

export function toPlayer(r: Row): PlayerRow {
  return {
    id: r.id as string,
    gameId: r.game_id as string,
    userId: r.user_id as string,
    nickname: r.nickname as string,
    score: r.score as number,
    rttMs: r.rtt_ms as number,
    joinedAt: ms(r.joined_at)!,
  }
}

export function toQuestion(r: Row): QuestionRow {
  return {
    id: r.id as string,
    gameId: r.game_id as string,
    idx: r.idx as number,
    category: r.category as string,
    text: r.text as string,
    difficulty: (r.difficulty as string) ?? null,
    sourceNote: (r.source_note as string) ?? null,
    limitMs: r.limit_ms as number,
    revealedAnswer: (r.revealed_answer as string) ?? null,
  }
}

export function toAnswer(r: Row): AnswerRow {
  return {
    id: r.id as string,
    gameId: r.game_id as string,
    questionId: r.question_id as string,
    playerId: r.player_id as string,
    given: r.given as string,
    verdict: r.verdict as AnswerRow['verdict'],
    points: r.points as number,
    elapsedMs: r.elapsed_ms as number,
    createdAt: ms(r.created_at)!,
  }
}

export class SupabaseStore implements GameStore {
  private db: SupabaseClient
  constructor(db: SupabaseClient) {
    this.db = db
  }

  async insertGame(game: Omit<GameRow, 'id'>) {
    const res = await this.db.from('games').insert(fromGame(game)).select().single()
    if (res.error?.code === '23505') throw new CodeTakenError()
    return toGame(check(res))
  }
  async getGame(id: string) {
    const data = check(await this.db.from('games').select().eq('id', id).maybeSingle())
    return data ? toGame(data) : null
  }
  async getGameByCode(code: string) {
    const data = check(await this.db.from('games').select().eq('code', code).maybeSingle())
    return data ? toGame(data) : null
  }
  async updateGame(id: string, patch: Partial<GameRow>, expected: { status: GameStatus; currentIndex?: number }) {
    let query = this.db.from('games').update(fromGame(patch)).eq('id', id).eq('status', expected.status)
    if (expected.currentIndex !== undefined) query = query.eq('current_index', expected.currentIndex)
    const data = check(await query.select('id'))
    return data.length > 0
  }
  async countGamesByHostSince(hostId: string, since: number) {
    const res = await this.db.from('games').select('id', { count: 'exact', head: true }).eq('host_id', hostId).gte('created_at', iso(since)!)
    check(res)
    return res.count ?? 0
  }
  async deleteGamesCreatedBefore(time: number) {
    return check(await this.db.from('games').delete().lt('created_at', iso(time)!).select('id')).length
  }

  async listPlayers(gameId: string) {
    return check(await this.db.from('players').select().eq('game_id', gameId).order('joined_at')).map(toPlayer)
  }
  async getPlayer(gameId: string, userId: string) {
    const data = check(await this.db.from('players').select().eq('game_id', gameId).eq('user_id', userId).maybeSingle())
    return data ? toPlayer(data) : null
  }
  async insertPlayer(p: Omit<PlayerRow, 'id'>) {
    const row = { game_id: p.gameId, user_id: p.userId, nickname: p.nickname, score: p.score, rtt_ms: p.rttMs, joined_at: iso(p.joinedAt) }
    return toPlayer(check(await this.db.from('players').insert(row).select().single()))
  }
  async updatePlayer(id: string, patch: Partial<Pick<PlayerRow, 'rttMs' | 'nickname'>>) {
    const row: Row = {}
    if (patch.rttMs !== undefined) row.rtt_ms = patch.rttMs
    if (patch.nickname !== undefined) row.nickname = patch.nickname
    check(await this.db.from('players').update(row).eq('id', id))
  }
  async addScore(playerId: string, delta: number) {
    check(await this.db.rpc('add_score', { p_player: playerId, p_delta: delta }))
  }

  async insertQuestions(questions: NewQuestion[]) {
    const rows = questions.map((q) => ({
      game_id: q.gameId,
      idx: q.idx,
      category: q.category,
      text: q.text,
      difficulty: q.difficulty,
      source_note: q.sourceNote,
      limit_ms: q.limitMs,
    }))
    const inserted = check(await this.db.from('questions').insert(rows).select('id, idx')) as { id: string; idx: number }[]
    const secrets = inserted.map((r) => {
      const q = questions.find((x) => x.idx === r.idx)!
      return { question_id: r.id, answer: q.answer, answerline: q.answerline }
    })
    check(await this.db.from('question_secrets').insert(secrets))
  }
  async getQuestion(gameId: string, idx: number) {
    const data = check(
      await this.db.from('questions').select('*, question_secrets(answer, answerline)').eq('game_id', gameId).eq('idx', idx).maybeSingle(),
    ) as Row | null
    if (!data) return null
    const secret = (Array.isArray(data.question_secrets) ? data.question_secrets[0] : data.question_secrets) as QuestionSecret
    return { ...toQuestion(data), answer: secret.answer, answerline: secret.answerline }
  }
  async revealQuestion(questionId: string, answer: string) {
    check(await this.db.from('questions').update({ revealed_answer: answer }).eq('id', questionId))
  }

  async listAnswers(questionId: string) {
    return check(await this.db.from('answers').select().eq('question_id', questionId).order('created_at')).map(toAnswer)
  }
  async getAnswer(id: string) {
    const data = check(await this.db.from('answers').select().eq('id', id).maybeSingle())
    return data ? toAnswer(data) : null
  }
  async insertAnswer(a: Omit<AnswerRow, 'id' | 'createdAt'>) {
    const row = {
      game_id: a.gameId,
      question_id: a.questionId,
      player_id: a.playerId,
      given: a.given,
      verdict: a.verdict,
      points: a.points,
      elapsed_ms: a.elapsedMs,
    }
    return toAnswer(check(await this.db.from('answers').insert(row).select().single()))
  }
  async updateAnswer(id: string, patch: Partial<Pick<AnswerRow, 'verdict' | 'points'>>) {
    check(await this.db.from('answers').update(patch).eq('id', id))
  }
  async claimFirstCorrect(questionId: string, playerId: string) {
    const res = await this.db.from('question_firsts').insert({ question_id: questionId, player_id: playerId })
    if (res.error?.code === '23505') return false
    check(res)
    return true
  }

  async insertFeed(e: FeedEvent) {
    const row = { game_id: e.gameId, player_id: e.playerId, nickname: e.nickname, kind: e.kind, elapsed_ms: e.elapsedMs, points: e.points }
    check(await this.db.from('feed_events').insert(row))
  }

  async setInterests(gameId: string, playerId: string, interests: string[]) {
    check(await this.db.from('player_interests').delete().eq('player_id', playerId))
    if (interests.length) {
      check(await this.db.from('player_interests').insert(interests.map((interest) => ({ game_id: gameId, player_id: playerId, interest }))))
    }
  }
  async deleteInterests(gameId: string) {
    check(await this.db.from('player_interests').delete().eq('game_id', gameId))
  }
  async sharedInterests(gameId: string) {
    return (check(await this.db.rpc('shared_interests', { p_game: gameId })) as string[]) ?? []
  }
}

/**
 * In-memory GameStore for tests. Behaves like the Supabase one: conditional
 * updates, and recordAnswer/overrideAnswer run without awaiting in between,
 * the way the database runs them in one transaction.
 */
import { CodeTakenError, GameFullError, NicknameTakenError, type GameStore } from './store.ts'
import type {
  AnswerRow,
  FeedEvent,
  GameRow,
  NewQuestion,
  PlayerRow,
  QuestionChunk,
  QuestionRow,
  QuestionSecret,
  RecordAnswerInput,
  RecordAnswerResult,
} from './types.ts'

export class MemoryStore implements GameStore {
  games = new Map<string, GameRow>()
  players = new Map<string, PlayerRow>()
  questions = new Map<string, QuestionRow & QuestionSecret>()
  chunks = new Map<string, QuestionChunk[]>()
  answers = new Map<string, AnswerRow>()
  firsts = new Map<string, string>()
  feed: FeedEvent[] = []
  interests = new Map<string, { gameId: string; interests: string[] }>()
  /** Public view of each question, as row level security would show it. */
  private published = new Map<string, QuestionRow>()
  private seq = 0
  private now: () => number
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private id(prefix: string) {
    return `${prefix}${++this.seq}`
  }

  /** What a player could read about a question right now. */
  publicQuestion(questionId: string): QuestionRow | undefined {
    const q = this.published.get(questionId)
    return q ? { ...q } : undefined
  }

  async insertGame(game: Omit<GameRow, 'id'>) {
    if ([...this.games.values()].some((g) => g.code === game.code)) throw new CodeTakenError()
    const row = { ...game, id: this.id('g') }
    this.games.set(row.id, row)
    return { ...row }
  }
  async getGame(id: string) {
    const g = this.games.get(id)
    return g ? { ...g } : null
  }
  async getGameByCode(code: string) {
    const g = [...this.games.values()].find((x) => x.code === code)
    return g ? { ...g } : null
  }
  async updateGame(id: string, patch: Partial<GameRow>, expected: { status: GameRow['status']; currentIndex?: number }) {
    const g = this.games.get(id)
    if (!g || g.status !== expected.status) return false
    if (expected.currentIndex !== undefined && g.currentIndex !== expected.currentIndex) return false
    this.games.set(id, { ...g, ...patch })
    return true
  }
  async countGamesByHostSince(hostId: string, since: number) {
    return [...this.games.values()].filter((g) => g.hostId === hostId && g.createdAt >= since).length
  }
  async deleteGamesCreatedBefore(time: number) {
    const old = [...this.games.values()].filter((g) => g.createdAt < time)
    for (const g of old) this.games.delete(g.id)
    return old.length
  }

  async listPlayers(gameId: string) {
    return [...this.players.values()].filter((p) => p.gameId === gameId).map((p) => ({ ...p }))
  }
  async getPlayer(gameId: string, userId: string) {
    const p = [...this.players.values()].find((x) => x.gameId === gameId && x.userId === userId)
    return p ? { ...p } : null
  }
  async insertPlayer(player: Omit<PlayerRow, 'id'>, maxPlayers: number) {
    const inGame = [...this.players.values()].filter((p) => p.gameId === player.gameId)
    if (inGame.length >= maxPlayers) throw new GameFullError()
    if (inGame.some((p) => p.nickname.toLowerCase() === player.nickname.toLowerCase())) throw new NicknameTakenError()
    const row = { ...player, id: this.id('p') }
    this.players.set(row.id, row)
    return { ...row }
  }
  async updatePlayer(id: string, patch: Partial<Pick<PlayerRow, 'rttMs' | 'nickname'>>) {
    const p = this.players.get(id)
    if (p) this.players.set(id, { ...p, ...patch })
  }

  async insertQuestions(questions: NewQuestion[]) {
    for (const { chunks, ...q } of questions) {
      const id = this.id('q')
      this.questions.set(id, { ...q, id, sourceNote: q.sourceNote, revealedAnswer: null })
      this.published.set(id, {
        id,
        gameId: q.gameId,
        idx: q.idx,
        category: q.category,
        text: q.text,
        difficulty: q.difficulty,
        sourceNote: null,
        limitMs: q.limitMs,
        wordCount: q.wordCount,
        powerIndex: q.powerIndex,
        revealedAnswer: null,
      })
      this.chunks.set(id, chunks)
    }
  }
  async getQuestion(gameId: string, idx: number) {
    const q = [...this.questions.values()].find((x) => x.gameId === gameId && x.idx === idx)
    return q ? { ...q, revealedAnswer: this.published.get(q.id)?.revealedAnswer ?? null } : null
  }
  async revealQuestion(questionId: string, reveal: { answer: string; text: string; sourceNote: string | null }) {
    const q = this.published.get(questionId)
    if (q) this.published.set(questionId, { ...q, revealedAnswer: reveal.answer, text: reveal.text, sourceNote: reveal.sourceNote })
  }

  async listAnswers(questionId: string) {
    return [...this.answers.values()].filter((a) => a.questionId === questionId).map((a) => ({ ...a }))
  }
  async getAnswer(id: string) {
    const a = this.answers.get(id)
    return a ? { ...a } : null
  }

  async recordAnswer(input: RecordAnswerInput): Promise<RecordAnswerResult> {
    const mine = [...this.answers.values()].filter((a) => a.questionId === input.questionId && a.playerId === input.playerId)
    const wrong = mine.filter((a) => a.verdict === 'wrong').length
    const prompts = mine.filter((a) => a.verdict === 'prompt').length
    const done = mine.some((a) => a.verdict === 'correct' || a.verdict === 'overridden' || a.verdict === 'late')
    if (done || wrong >= input.maxAttempts) return { ok: false, reason: 'done' }
    if (mine.length >= input.maxSubmits) return { ok: false, reason: 'too_many' }

    let verdict = input.verdict
    let points = input.points
    if (verdict === 'prompt' && prompts >= input.maxPrompts) {
      verdict = 'wrong'
      points = input.wrongPoints
    }
    if (verdict === 'correct' && !this.firsts.has(input.questionId)) {
      this.firsts.set(input.questionId, input.playerId)
      points += input.firstCorrectBonus
    }
    const id = this.id('a')
    this.answers.set(id, {
      id,
      gameId: input.gameId,
      questionId: input.questionId,
      playerId: input.playerId,
      given: input.given,
      verdict,
      points,
      elapsedMs: input.elapsedMs,
      createdAt: this.now(),
    })
    const player = this.players.get(input.playerId)
    if (player) player.score += points
    return { ok: true, verdict, points, wrongCount: wrong + (verdict === 'wrong' ? 1 : 0) }
  }

  async overrideAnswer(answerId: string, points: number) {
    const answer = this.answers.get(answerId)
    if (!answer || answer.verdict !== 'wrong') return false
    const alreadyRight = [...this.answers.values()].some(
      (a) => a.questionId === answer.questionId && a.playerId === answer.playerId && (a.verdict === 'correct' || a.verdict === 'overridden'),
    )
    if (alreadyRight) return false
    this.answers.set(answerId, { ...answer, verdict: 'overridden', points })
    const player = this.players.get(answer.playerId)
    if (player) player.score += points - answer.points
    return true
  }

  async insertFeed(event: FeedEvent) {
    this.feed.push(event)
  }

  async setInterests(gameId: string, playerId: string, interests: string[]) {
    this.interests.set(playerId, { gameId, interests })
  }
  async deleteInterests(gameId: string) {
    for (const [playerId, entry] of this.interests) if (entry.gameId === gameId) this.interests.delete(playerId)
  }
  async sharedInterests(gameId: string) {
    const counts = new Map<string, number>()
    for (const entry of this.interests.values()) {
      if (entry.gameId !== gameId) continue
      for (const i of new Set(entry.interests)) counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    return [...counts]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([i]) => i)
  }
}

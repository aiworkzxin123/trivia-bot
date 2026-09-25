/** In-memory GameStore for tests. Behaves like the Supabase one, including the conditional updates. */
import { CodeTakenError, type GameStore } from './store.ts'
import type { AnswerRow, FeedEvent, GameRow, PlayerRow, QuestionRow, QuestionSecret } from './types.ts'

export class MemoryStore implements GameStore {
  games = new Map<string, GameRow>()
  players = new Map<string, PlayerRow>()
  questions = new Map<string, QuestionRow & QuestionSecret>()
  answers = new Map<string, AnswerRow>()
  firsts = new Map<string, string>()
  feed: FeedEvent[] = []
  interests = new Map<string, { gameId: string; interests: string[] }>()
  private seq = 0
  private now: () => number
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private id(prefix: string) {
    return `${prefix}${++this.seq}`
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
  async insertPlayer(player: Omit<PlayerRow, 'id'>) {
    const row = { ...player, id: this.id('p') }
    this.players.set(row.id, row)
    return { ...row }
  }
  async updatePlayer(id: string, patch: Partial<Pick<PlayerRow, 'rttMs' | 'nickname'>>) {
    const p = this.players.get(id)
    if (p) this.players.set(id, { ...p, ...patch })
  }
  async addScore(playerId: string, delta: number) {
    const p = this.players.get(playerId)
    if (p) p.score += delta
  }

  async insertQuestions(questions: Parameters<GameStore['insertQuestions']>[0]) {
    for (const q of questions) {
      const row = { ...q, id: this.id('q'), revealedAnswer: null }
      this.questions.set(row.id, row)
    }
  }
  async getQuestion(gameId: string, idx: number) {
    const q = [...this.questions.values()].find((x) => x.gameId === gameId && x.idx === idx)
    return q ? { ...q } : null
  }
  async revealQuestion(questionId: string, answer: string) {
    const q = this.questions.get(questionId)
    if (q) q.revealedAnswer = answer
  }

  async listAnswers(questionId: string) {
    return [...this.answers.values()].filter((a) => a.questionId === questionId).map((a) => ({ ...a }))
  }
  async getAnswer(id: string) {
    const a = this.answers.get(id)
    return a ? { ...a } : null
  }
  async insertAnswer(answer: Omit<AnswerRow, 'id' | 'createdAt'>) {
    const row = { ...answer, id: this.id('a'), createdAt: this.now() }
    this.answers.set(row.id, row)
    return { ...row }
  }
  async updateAnswer(id: string, patch: Partial<Pick<AnswerRow, 'verdict' | 'points'>>) {
    const a = this.answers.get(id)
    if (a) this.answers.set(id, { ...a, ...patch })
  }
  async claimFirstCorrect(questionId: string, playerId: string) {
    if (this.firsts.has(questionId)) return false
    this.firsts.set(questionId, playerId)
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

/**
 * Multiplayer rules, enforced on the server. The Supabase function is a thin
 * wrapper around handleAction; tests drive it with a MemoryStore.
 */
import { judge } from '../game/answers/judge.ts'
import { isInterest } from '../game/interests.ts'
import type { SourcedQuestion } from '../game/questions/sources.ts'
import { adjustedElapsed, DEFAULT_SCORING, scoreAnswer } from '../game/scoring.ts'
import { planTossup, TOSSUP_ATTEMPTS, tossupPoints } from '../game/tossup.ts'
import { CodeTakenError, type GameStore } from './store.ts'
import type { AnswerRow, GameRow, GameSettings, PlayerRow, QuestionRow } from './types.ts'

export const MAX_PLAYERS = 50
export const GAMES_PER_HOUR = 10
export const SUBMITS_PER_QUESTION = 10
export const CLASSIC_ATTEMPTS = 2
/** Delay before each question opens, so every player sees it start at the same moment. */
export const QUESTION_LEAD_MS = 2000
export const GAME_TTL_MS = 24 * 60 * 60 * 1000

const COUNTS = [5, 10, 15, 20]
const TIME_LIMITS = [15, 20, 30]
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export interface ServiceDeps {
  store: GameStore
  now: () => number
  loadQuestions: (settings: GameSettings) => Promise<SourcedQuestion[]>
  random?: () => number
}

export class GameError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Action =
  | { type: 'create'; nickname: string; settings: GameSettings; interests?: string[] }
  | { type: 'join'; code: string; nickname: string; interests?: string[] }
  | { type: 'updateSettings'; gameId: string; settings: GameSettings }
  | { type: 'ping'; gameId: string; rttMs?: number }
  | { type: 'suggestions'; gameId: string }
  | { type: 'start'; gameId: string }
  | { type: 'submit'; gameId: string; answer: string }
  | { type: 'reveal'; gameId: string }
  | { type: 'override'; gameId: string; answerId: string }
  | { type: 'next'; gameId: string }
  | { type: 'cleanup' }

export interface SubmitResult {
  result: 'correct' | 'prompt' | 'wrong' | 'late'
  points: number
  attemptsLeft: number
  promptText?: string
}

// ---------- validation ----------

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new GameError(400, `${field} is missing`)
  // Strip control characters so names can't break the layout.
  const clean = value.replace(/\p{Cc}/gu, '').trim()
  if (!clean) throw new GameError(400, `${field} can't be empty`)
  if (clean.length > max) throw new GameError(400, `${field} can be at most ${max} characters`)
  return clean
}

export function validateSettings(value: unknown): GameSettings {
  const s = (value ?? {}) as Partial<GameSettings>
  const format = s.format === 'tossup' ? 'tossup' : 'classic'
  const categories = Array.isArray(s.categories)
    ? s.categories.filter((c): c is string => typeof c === 'string' && c.length <= 60).slice(0, 30)
    : []
  return {
    format,
    categories,
    count: COUNTS.includes(Number(s.count)) ? Number(s.count) : 10,
    timeLimitSec: TIME_LIMITS.includes(Number(s.timeLimitSec)) ? Number(s.timeLimitSec) : 20,
    difficulty: s.difficulty === 'easy' || s.difficulty === 'hard' ? s.difficulty : 'medium',
  }
}

function validInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((i): i is string => typeof i === 'string' && isInterest(i)))].slice(0, 20)
}

// ---------- helpers ----------

function maxAttempts(game: GameRow) {
  return game.settings.format === 'tossup' ? TOSSUP_ATTEMPTS : CLASSIC_ATTEMPTS
}

function randomCode(random: () => number) {
  return Array.from({ length: 5 }, () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)]).join('')
}

function limitFor(settings: GameSettings, q: SourcedQuestion) {
  return settings.format === 'tossup' ? planTossup(q.text).limitMs : settings.timeLimitSec * 1000
}

function pointsFor(game: GameRow, question: QuestionRow, correct: boolean, elapsedMs: number, isFirstCorrect: boolean) {
  const answer = { correct, elapsedMs, isFirstCorrect }
  if (game.settings.format === 'tossup') return tossupPoints(answer, planTossup(question.text))
  return scoreAnswer({ ...answer, limitMs: question.limitMs }, DEFAULT_SCORING)
}

function playerDone(answers: AnswerRow[], playerId: string, attempts: number) {
  const mine = answers.filter((a) => a.playerId === playerId)
  if (mine.some((a) => a.verdict === 'correct' || a.verdict === 'overridden' || a.verdict === 'late')) return true
  return mine.filter((a) => a.verdict === 'wrong').length >= attempts
}

async function loadGame(deps: ServiceDeps, gameId: unknown): Promise<GameRow> {
  if (typeof gameId !== 'string') throw new GameError(400, 'gameId is missing')
  const game = await deps.store.getGame(gameId)
  if (!game) throw new GameError(404, 'This game has ended or never existed')
  return game
}

async function requirePlayer(deps: ServiceDeps, game: GameRow, userId: string): Promise<PlayerRow> {
  const player = await deps.store.getPlayer(game.id, userId)
  if (!player) throw new GameError(403, "You're not in this game")
  return player
}

function requireHost(game: GameRow, userId: string) {
  if (game.hostId !== userId) throw new GameError(403, 'Only the host can do that')
}

async function openQuestion(deps: ServiceDeps, game: GameRow, idx: number, expected: { status: GameRow['status']; currentIndex?: number }) {
  const question = await deps.store.getQuestion(game.id, idx)
  if (!question) throw new GameError(500, 'Question is missing')
  const startedAt = deps.now() + QUESTION_LEAD_MS
  return deps.store.updateGame(
    game.id,
    { status: 'question', currentIndex: idx, questionStartedAt: startedAt, questionEndsAt: startedAt + question.limitMs },
    expected,
  )
}

async function reveal(deps: ServiceDeps, game: GameRow) {
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!question) return
  // Publish the answer before the status change, so clients that react to it can read the answer.
  await deps.store.revealQuestion(question.id, question.answer)
  await deps.store.updateGame(game.id, { status: 'reveal' }, { status: 'question', currentIndex: game.currentIndex })
}

// ---------- actions ----------

async function create(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'create' }>) {
  const nickname = text(a.nickname, 'Name', 20)
  const settings = validateSettings(a.settings)
  const now = deps.now()
  if ((await deps.store.countGamesByHostSince(userId, now - 60 * 60 * 1000)) >= GAMES_PER_HOUR) {
    throw new GameError(429, `You can host up to ${GAMES_PER_HOUR} games an hour. Try again later.`)
  }
  for (let tries = 0; tries < 5; tries++) {
    try {
      const game = await deps.store.insertGame({
        code: randomCode(deps.random ?? Math.random),
        hostId: userId,
        status: 'lobby',
        settings,
        currentIndex: -1,
        questionCount: 0,
        questionStartedAt: null,
        questionEndsAt: null,
        createdAt: now,
      })
      const player = await deps.store.insertPlayer({ gameId: game.id, userId, nickname, score: 0, rttMs: 0, joinedAt: now })
      await deps.store.setInterests(game.id, player.id, validInterests(a.interests))
      return { gameId: game.id, code: game.code, playerId: player.id }
    } catch (err) {
      if (!(err instanceof CodeTakenError)) throw err
    }
  }
  throw new GameError(503, "Couldn't create a game code. Try again.")
}

async function join(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'join' }>) {
  const code = text(a.code, 'Game code', 10).toUpperCase()
  const nickname = text(a.nickname, 'Name', 20)
  const game = await deps.store.getGameByCode(code)
  if (!game) throw new GameError(404, `No game with the code ${code}. Check the code with the host.`)

  const existing = await deps.store.getPlayer(game.id, userId)
  if (existing) return { gameId: game.id, code: game.code, playerId: existing.id }

  if (game.status !== 'lobby') throw new GameError(409, 'This game has already started')
  const players = await deps.store.listPlayers(game.id)
  if (players.length >= MAX_PLAYERS) throw new GameError(409, `This game is full (${MAX_PLAYERS} players)`)
  if (players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
    throw new GameError(409, `Someone in this game is already called ${nickname}. Pick another name.`)
  }
  const player = await deps.store.insertPlayer({ gameId: game.id, userId, nickname, score: 0, rttMs: 0, joinedAt: deps.now() })
  await deps.store.setInterests(game.id, player.id, validInterests(a.interests))
  return { gameId: game.id, code: game.code, playerId: player.id }
}

async function start(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  requireHost(game, userId)
  if (!(await deps.store.updateGame(game.id, { status: 'starting' }, { status: 'lobby' }))) {
    throw new GameError(409, 'This game has already started')
  }
  let questions: SourcedQuestion[]
  try {
    questions = (await deps.loadQuestions(game.settings)).slice(0, game.settings.count)
    if (!questions.length) throw new GameError(422, 'No questions match those categories. Pick more categories.')
  } catch (err) {
    await deps.store.updateGame(game.id, { status: 'lobby' }, { status: 'starting' })
    throw err
  }
  await deps.store.insertQuestions(
    questions.map((q, idx) => ({
      gameId: game.id,
      idx,
      category: q.category,
      text: q.text,
      difficulty: q.difficulty ?? null,
      sourceNote: q.sourceNote ?? null,
      limitMs: limitFor(game.settings, q),
      answer: q.answer,
      answerline: q.answerline,
    })),
  )
  await deps.store.updateGame(game.id, { questionCount: questions.length }, { status: 'starting' })
  await openQuestion(deps, game, 0, { status: 'starting' })
  return { questionCount: questions.length }
}

async function submit(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'submit' }>): Promise<SubmitResult> {
  const game = await loadGame(deps, a.gameId)
  const player = await requirePlayer(deps, game, userId)
  const given = text(a.answer, 'Answer', 200)
  if (game.status !== 'question' || game.questionStartedAt === null || game.questionEndsAt === null) {
    throw new GameError(409, 'There is no question open right now')
  }
  const now = deps.now()
  if (now < game.questionStartedAt) throw new GameError(409, "The question hasn't started yet")

  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!question) throw new GameError(500, 'Question is missing')
  const answers = await deps.store.listAnswers(question.id)
  const mine = answers.filter((x) => x.playerId === player.id)
  const attempts = maxAttempts(game)
  if (mine.length >= SUBMITS_PER_QUESTION) throw new GameError(429, "You've sent too many answers for this question")
  if (playerDone(answers, player.id, attempts)) throw new GameError(409, "You've already answered this question")
  const wrongSoFar = mine.filter((x) => x.verdict === 'wrong').length

  const elapsedMs = Math.round(adjustedElapsed(now - game.questionStartedAt, player.rttMs))
  const base = { gameId: game.id, questionId: question.id, playerId: player.id, given, elapsedMs }

  let outcome: SubmitResult
  if (now > game.questionEndsAt) {
    await deps.store.insertAnswer({ ...base, verdict: 'late', points: 0 })
    outcome = { result: 'late', points: 0, attemptsLeft: 0 }
  } else {
    const verdict = judge(question, given)
    if (verdict.result === 'prompt') {
      await deps.store.insertAnswer({ ...base, verdict: 'prompt', points: 0 })
      return { result: 'prompt', points: 0, attemptsLeft: attempts - wrongSoFar, promptText: verdict.promptText }
    }
    const correct = verdict.result === 'correct'
    const first = correct && (await deps.store.claimFirstCorrect(question.id, player.id))
    const points = pointsFor(game, question, correct, elapsedMs, first)
    await deps.store.insertAnswer({ ...base, verdict: correct ? 'correct' : 'wrong', points })
    if (points) await deps.store.addScore(player.id, points)
    if (correct) {
      await deps.store.insertFeed({ gameId: game.id, playerId: player.id, nickname: player.nickname, kind: 'correct', elapsedMs, points })
    }
    outcome = { result: correct ? 'correct' : 'wrong', points, attemptsLeft: correct ? 0 : attempts - wrongSoFar - 1 }
  }

  // End the question early once everyone is done.
  const [players, latest] = await Promise.all([deps.store.listPlayers(game.id), deps.store.listAnswers(question.id)])
  if (players.every((p) => playerDone(latest, p.id, attempts))) await reveal(deps, game)
  return outcome
}

async function revealAction(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  await requirePlayer(deps, game, userId)
  if (game.status !== 'question') return { status: game.status }
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  const players = await deps.store.listPlayers(game.id)
  const answers = question ? await deps.store.listAnswers(question.id) : []
  const everyoneDone = players.every((p) => playerDone(answers, p.id, maxAttempts(game)))
  if (deps.now() < (game.questionEndsAt ?? 0) && !everyoneDone) throw new GameError(409, 'Time is not up yet')
  await reveal(deps, game)
  return { status: 'reveal' }
}

async function override(deps: ServiceDeps, userId: string, a: Extract<Action, { type: 'override' }>) {
  const game = await loadGame(deps, a.gameId)
  requireHost(game, userId)
  if (game.status !== 'reveal') throw new GameError(409, 'Answers can only be accepted after the reveal')
  const answer = typeof a.answerId === 'string' ? await deps.store.getAnswer(a.answerId) : null
  const question = await deps.store.getQuestion(game.id, game.currentIndex)
  if (!answer || !question || answer.questionId !== question.id) throw new GameError(404, 'That answer is not from this question')
  if (answer.verdict !== 'wrong') throw new GameError(409, 'Only wrong answers can be accepted')
  const answers = await deps.store.listAnswers(question.id)
  if (answers.some((x) => x.playerId === answer.playerId && (x.verdict === 'correct' || x.verdict === 'overridden'))) {
    throw new GameError(409, 'This player already got the question right')
  }
  // Scored at the original submission time; replacing the points also refunds a tossup penalty.
  const points = pointsFor(game, question, true, answer.elapsedMs, false)
  await deps.store.updateAnswer(answer.id, { verdict: 'overridden', points })
  await deps.store.addScore(answer.playerId, points - answer.points)
  const player = (await deps.store.listPlayers(game.id)).find((p) => p.id === answer.playerId)
  await deps.store.insertFeed({
    gameId: game.id,
    playerId: answer.playerId,
    nickname: player?.nickname ?? 'Player',
    kind: 'override',
    elapsedMs: answer.elapsedMs,
    points,
  })
  return { points }
}

async function nextAction(deps: ServiceDeps, userId: string, gameId: string) {
  const game = await loadGame(deps, gameId)
  requireHost(game, userId)
  if (game.status !== 'reveal') throw new GameError(409, 'Wait for the answer to be revealed')
  const idx = game.currentIndex + 1
  if (idx >= game.questionCount) {
    await deps.store.updateGame(game.id, { status: 'finished' }, { status: 'reveal', currentIndex: game.currentIndex })
    // Interests are only kept while the game runs.
    await deps.store.deleteInterests(game.id)
    return { status: 'finished' }
  }
  await openQuestion(deps, game, idx, { status: 'reveal', currentIndex: game.currentIndex })
  return { status: 'question', index: idx }
}

export async function handleAction(deps: ServiceDeps, userId: string | null, raw: unknown): Promise<unknown> {
  const action = (raw ?? {}) as Action
  if (action.type === 'cleanup') {
    return { deleted: await deps.store.deleteGamesCreatedBefore(deps.now() - GAME_TTL_MS) }
  }
  if (!userId) throw new GameError(401, 'Sign in first')

  switch (action.type) {
    case 'create':
      return create(deps, userId, action)
    case 'join':
      return join(deps, userId, action)
    case 'updateSettings': {
      const game = await loadGame(deps, action.gameId)
      requireHost(game, userId)
      const settings = validateSettings(action.settings)
      if (!(await deps.store.updateGame(game.id, { settings }, { status: 'lobby' }))) {
        throw new GameError(409, 'Settings can only change before the game starts')
      }
      return { settings }
    }
    case 'ping': {
      const game = await loadGame(deps, action.gameId)
      const player = await requirePlayer(deps, game, userId)
      if (typeof action.rttMs === 'number' && Number.isFinite(action.rttMs)) {
        await deps.store.updatePlayer(player.id, { rttMs: Math.max(0, Math.min(2000, Math.round(action.rttMs))) })
      }
      return { serverNow: deps.now() }
    }
    case 'suggestions': {
      const game = await loadGame(deps, action.gameId)
      await requirePlayer(deps, game, userId)
      return { interests: await deps.store.sharedInterests(game.id) }
    }
    case 'start':
      return start(deps, userId, action.gameId)
    case 'submit':
      return submit(deps, userId, action)
    case 'reveal':
      return revealAction(deps, userId, action.gameId)
    case 'override':
      return override(deps, userId, action)
    case 'next':
      return nextAction(deps, userId, action.gameId)
    default:
      throw new GameError(400, 'Unknown action')
  }
}

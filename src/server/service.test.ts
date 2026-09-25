/** Whole games with simulated players, run against the in-memory store. */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildAnswerline } from '../game/answers/answerline.ts'
import type { SourcedQuestion } from '../game/questions/sources.ts'
import { planTossup } from '../game/tossup.ts'
import { MemoryStore } from './memoryStore.ts'
import { GAMES_PER_HOUR, GameError, handleAction, MAX_PLAYERS, QUESTION_LEAD_MS, type ServiceDeps } from './service.ts'
import type { GameSettings } from './types.ts'

const classicQuestions: SourcedQuestion[] = [
  { category: 'Geography', text: 'Capital of France?', answer: 'Paris', answerline: buildAnswerline('Paris', 'Geography') },
  { category: 'Geography', text: 'Largest ocean?', answer: 'Pacific Ocean', answerline: buildAnswerline('Pacific Ocean', 'Geography') },
]
const tossupQuestions: SourcedQuestion[] = [
  {
    category: 'History',
    text: 'This city saw the Easter Rising (*) and is the capital of Ireland.',
    answer: 'Dublin',
    answerline: '<b><u>Dublin</u></b>',
    sourceNote: '2017 POMMSS',
  },
]
const classic: GameSettings = { format: 'classic', categories: [], count: 10, timeLimitSec: 20, difficulty: 'medium' }

let clock: number
let store: MemoryStore
let deps: ServiceDeps
let questions: SourcedQuestion[]

function act(userId: string | null, action: object) {
  return handleAction(deps, userId, action) as Promise<Record<string, unknown>>
}

async function expectError(promise: Promise<unknown>, status: number) {
  const err = await promise.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(GameError)
  expect((err as GameError).status).toBe(status)
}

/** Host plus guests in a lobby. */
async function lobby(guests: string[], settings = classic) {
  const { gameId, code } = await act('host', { type: 'create', nickname: 'Host', settings })
  for (const g of guests) await act(g, { type: 'join', code, nickname: g })
  return { gameId: gameId as string, code: code as string }
}

/** Moves the clock to the moment the open question starts, plus `ms`. */
function at(gameId: string, ms: number) {
  clock = store.games.get(gameId)!.questionStartedAt! + ms
}

function score(gameId: string, nickname: string) {
  return [...store.players.values()].find((p) => p.gameId === gameId && p.nickname === nickname)!.score
}

beforeEach(() => {
  clock = 1_000_000
  store = new MemoryStore(() => clock)
  questions = classicQuestions
  deps = { store, now: () => clock, loadQuestions: async () => questions, random: Math.random }
})

describe('lobby', () => {
  it('creates a game with a 5-letter code and the host as a player', async () => {
    const { gameId, code } = await lobby([])
    expect(code).toMatch(/^[A-HJ-NP-Z]{5}$/)
    expect(await store.listPlayers(gameId)).toHaveLength(1)
  })

  it('lets players join with a lowercase code', async () => {
    const { code, gameId } = await lobby([])
    await act('ana', { type: 'join', code: code.toLowerCase(), nickname: 'Ana' })
    expect((await store.listPlayers(gameId)).map((p) => p.nickname)).toEqual(['Host', 'Ana'])
  })

  it('returns the same player when someone joins twice', async () => {
    const { code } = await lobby([])
    const a = await act('ana', { type: 'join', code, nickname: 'Ana' })
    const b = await act('ana', { type: 'join', code, nickname: 'Ana' })
    expect(a.playerId).toBe(b.playerId)
  })

  it('rejects a taken name, an unknown code and an empty name', async () => {
    const { code } = await lobby(['Ana'])
    await expectError(act('ana2', { type: 'join', code, nickname: 'ana' }), 409)
    await expectError(act('bo', { type: 'join', code: 'ZZZZZ', nickname: 'Bo' }), 404)
    await expectError(act('bo', { type: 'join', code, nickname: '   ' }), 400)
  })

  it(`stops at ${MAX_PLAYERS} players`, async () => {
    const guests = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => `p${i}`)
    const { code } = await lobby(guests)
    await expectError(act('late', { type: 'join', code, nickname: 'Late' }), 409)
  })

  it('does not let anyone join after the start', async () => {
    const { code, gameId } = await lobby([])
    await act('host', { type: 'start', gameId })
    await expectError(act('bo', { type: 'join', code, nickname: 'Bo' }), 409)
  })

  it(`limits hosts to ${GAMES_PER_HOUR} games an hour`, async () => {
    for (let i = 0; i < GAMES_PER_HOUR; i++) await act('host', { type: 'create', nickname: 'Host', settings: classic })
    await expectError(act('host', { type: 'create', nickname: 'Host', settings: classic }), 429)
    clock += 61 * 60 * 1000
    await act('host', { type: 'create', nickname: 'Host', settings: classic })
  })

  it('only lets the host start or change settings', async () => {
    const { gameId } = await lobby(['ana'])
    await expectError(act('ana', { type: 'start', gameId }), 403)
    await expectError(act('ana', { type: 'updateSettings', gameId, settings: classic }), 403)
  })

  it('suggests only interests at least two players share', async () => {
    const { gameId, code } = await act('host', { type: 'create', nickname: 'Host', settings: classic, interests: ['cycling', 'music'] }) as { gameId: string; code: string }
    await act('ana', { type: 'join', code, nickname: 'Ana', interests: ['cycling', 'reading', 'not-a-real-interest'] })
    await act('bo', { type: 'join', code, nickname: 'Bo', interests: ['music', 'cycling'] })
    expect((await act('host', { type: 'suggestions', gameId })).interests).toEqual(['cycling', 'music'])
  })
})

describe('classic questions', () => {
  it('opens the first question after a short lead and refuses early answers', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    const game = store.games.get(gameId)!
    expect(game.status).toBe('question')
    expect(game.questionStartedAt).toBe(clock + QUESTION_LEAD_MS)
    await expectError(act('ana', { type: 'submit', gameId, answer: 'paris' }), 409)
  })

  it('keeps the answer secret until the reveal', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    expect((await store.getQuestion(gameId, 0))!.revealedAnswer).toBeNull()
  })

  it('scores faster correct answers higher and gives only the first the bonus', async () => {
    const { gameId } = await lobby(['ana', 'bo'])
    await act('host', { type: 'start', gameId })
    at(gameId, 2000)
    const ana = await act('ana', { type: 'submit', gameId, answer: 'paris' })
    at(gameId, 8000)
    const bo = await act('bo', { type: 'submit', gameId, answer: 'Paris' })
    expect(ana.points).toBe(950 + 100)
    expect(bo.points).toBe(800)
  })

  it('gives the first-correct bonus once when answers arrive together', async () => {
    const { gameId } = await lobby(['ana', 'bo', 'cy'])
    await act('host', { type: 'start', gameId })
    at(gameId, 3000)
    const results = await Promise.all(['ana', 'bo', 'cy'].map((u) => act(u, { type: 'submit', gameId, answer: 'paris' })))
    expect(results.filter((r) => r.points === 925 + 100)).toHaveLength(1)
    expect(results.filter((r) => r.points === 925)).toHaveLength(2)
  })

  it('allows two tries, and a prompt does not use one', async () => {
    questions = [classicQuestions[1]]
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 1000)
    expect(await act('ana', { type: 'submit', gameId, answer: 'ocean' })).toMatchObject({ result: 'prompt', attemptsLeft: 2 })
    expect(await act('ana', { type: 'submit', gameId, answer: 'atlantic' })).toMatchObject({ result: 'wrong', attemptsLeft: 1 })
    expect(await act('ana', { type: 'submit', gameId, answer: 'indian' })).toMatchObject({ result: 'wrong', attemptsLeft: 0 })
    await expectError(act('ana', { type: 'submit', gameId, answer: 'pacific' }), 409)
  })

  it('subtracts half the round-trip time, capped at 150ms', async () => {
    const { gameId } = await lobby(['ana'])
    await act('ana', { type: 'ping', gameId, rttMs: 200 })
    await act('host', { type: 'start', gameId })
    at(gameId, 4100)
    await act('ana', { type: 'submit', gameId, answer: 'paris' })
    const answer = [...store.answers.values()][0]
    expect(answer.elapsedMs).toBe(4000)
  })

  it('ends the question early once everyone is done, and reveals the answer', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 1000)
    await act('ana', { type: 'submit', gameId, answer: 'paris' })
    expect(store.games.get(gameId)!.status).toBe('question')
    await act('host', { type: 'submit', gameId, answer: 'lyon' })
    await act('host', { type: 'submit', gameId, answer: 'nice' })
    expect(store.games.get(gameId)!.status).toBe('reveal')
    expect((await store.getQuestion(gameId, 0))!.revealedAnswer).toBe('Paris')
  })

  it('refuses to reveal before time is up, then allows anyone to reveal after', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 5000)
    await expectError(act('ana', { type: 'reveal', gameId }), 409)
    at(gameId, 20_000)
    expect(await act('ana', { type: 'reveal', gameId })).toEqual({ status: 'reveal' })
  })

  it('scores a late answer as zero', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 20_500)
    expect(await act('ana', { type: 'submit', gameId, answer: 'paris' })).toMatchObject({ result: 'late', points: 0 })
  })

  it('shows who got it and how fast in the feed, never what they typed', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 2100)
    await act('ana', { type: 'submit', gameId, answer: 'paris' })
    expect(store.feed).toEqual([{ gameId, playerId: expect.any(String), nickname: 'ana', kind: 'correct', elapsedMs: 2100, points: 1048 }])
    expect(JSON.stringify(store.feed)).not.toMatch(/paris/i)
  })
})

describe('host override', () => {
  async function wrongAnswer() {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 10_000)
    await act('ana', { type: 'submit', gameId, answer: 'paree' })
    at(gameId, 20_001)
    await act('ana', { type: 'reveal', gameId })
    const answer = [...store.answers.values()].find((a) => a.given === 'paree')!
    return { gameId, answerId: answer.id }
  }

  it('accepts a wrong answer at its original time', async () => {
    const { gameId, answerId } = await wrongAnswer()
    expect(await act('host', { type: 'override', gameId, answerId })).toEqual({ points: 750 })
    expect(score(gameId, 'ana')).toBe(750)
    expect(store.feed.at(-1)).toMatchObject({ kind: 'override', nickname: 'ana' })
  })

  it('is host only and works once', async () => {
    const { gameId, answerId } = await wrongAnswer()
    await expectError(act('ana', { type: 'override', gameId, answerId }), 403)
    await act('host', { type: 'override', gameId, answerId })
    await expectError(act('host', { type: 'override', gameId, answerId }), 409)
  })

  it('is refused before the reveal', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 1000)
    await act('ana', { type: 'submit', gameId, answer: 'lyon' })
    const answer = [...store.answers.values()][0]
    await expectError(act('host', { type: 'override', gameId, answerId: answer.id }), 409)
  })
})

describe('game flow', () => {
  it('moves through every question and finishes', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    for (let i = 0; i < classicQuestions.length; i++) {
      at(gameId, 20_001)
      await act('host', { type: 'reveal', gameId })
      await act('host', { type: 'next', gameId })
    }
    expect(store.games.get(gameId)!.status).toBe('finished')
  })

  it('goes back to the lobby when no questions match', async () => {
    questions = []
    const { gameId } = await lobby([])
    await expectError(act('host', { type: 'start', gameId }), 422)
    expect(store.games.get(gameId)!.status).toBe('lobby')
  })

  it('cannot be started twice', async () => {
    const { gameId } = await lobby([])
    await act('host', { type: 'start', gameId })
    await expectError(act('host', { type: 'start', gameId }), 409)
  })

  it('deletes games older than a day on cleanup', async () => {
    await lobby([])
    clock += 25 * 60 * 60 * 1000
    expect(await act(null, { type: 'cleanup' })).toEqual({ deleted: 1 })
  })

  it('requires sign-in for everything except cleanup', async () => {
    await expectError(act(null, { type: 'create', nickname: 'X', settings: classic }), 401)
  })
})

describe('tossup mode', () => {
  const tossup: GameSettings = { ...classic, format: 'tossup' }

  it('times the question by its length and allows one try with a penalty', async () => {
    questions = tossupQuestions
    const { gameId } = await lobby(['ana'], tossup)
    await act('host', { type: 'start', gameId })
    const q = (await store.getQuestion(gameId, 0))!
    expect(q.limitMs).toBe(planTossup(tossupQuestions[0].text).limitMs)
    expect(q.sourceNote).toBe('2017 POMMSS')
    at(gameId, 500)
    expect(await act('ana', { type: 'submit', gameId, answer: 'cork' })).toMatchObject({ result: 'wrong', points: -50, attemptsLeft: 0 })
    expect(score(gameId, 'ana')).toBe(-50)
  })

  it('gives the power bonus early and refunds the penalty on override', async () => {
    questions = tossupQuestions
    const { gameId } = await lobby(['ana'], tossup)
    await act('host', { type: 'start', gameId })
    at(gameId, 500)
    const host = await act('host', { type: 'submit', gameId, answer: 'dublin' })
    expect(host.points as number).toBeGreaterThan(1200)
    await act('ana', { type: 'submit', gameId, answer: 'the irish capital' })
    expect(store.games.get(gameId)!.status).toBe('reveal')
    const wrong = [...store.answers.values()].find((a) => a.verdict === 'wrong')!
    const { points } = await act('host', { type: 'override', gameId, answerId: wrong.id })
    expect(score(gameId, 'ana')).toBe(points)
  })
})

describe('security hardening', () => {
  it('scores a correct answer once even when sent many times at once', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 2000)
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => act('ana', { type: 'submit', gameId, answer: 'paris' })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(score(gameId, 'ana')).toBe(950 + 100)
  })

  it('enforces the attempt limit when guesses arrive at once', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 2000)
    await Promise.allSettled(['lyon', 'nice', 'lille', 'paris'].map((answer) => act('ana', { type: 'submit', gameId, answer })))
    const mine = [...store.answers.values()].filter((a) => a.verdict !== 'prompt')
    expect(mine.length).toBeLessThanOrEqual(2)
  })

  it('applies a host override once even when sent twice at once', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 10_000)
    await act('ana', { type: 'submit', gameId, answer: 'paree' })
    await act('ana', { type: 'submit', gameId, answer: 'parris france' })
    at(gameId, 20_001)
    await act('ana', { type: 'reveal', gameId })
    const wrong = [...store.answers.values()].filter((a) => a.verdict === 'wrong')
    await Promise.allSettled([...wrong, ...wrong].map((a) => act('host', { type: 'override', gameId, answerId: a.id })))
    expect(score(gameId, 'ana')).toBe(750)
  })

  it('treats a third "more specific?" as a wrong answer', async () => {
    questions = [classicQuestions[1]]
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    at(gameId, 1000)
    expect((await act('ana', { type: 'submit', gameId, answer: 'ocean' })).result).toBe('prompt')
    expect((await act('ana', { type: 'submit', gameId, answer: 'the ocean' })).result).toBe('prompt')
    expect(await act('ana', { type: 'submit', gameId, answer: 'ocean!' })).toMatchObject({ result: 'wrong', attemptsLeft: 1 })
  })

  it('strips invisible characters from names, so lookalikes count as taken', async () => {
    const { code } = await lobby(['Ana'])
    await expectError(act('mallory', { type: 'join', code, nickname: 'An\u200Ba' }), 409)
  })

  it('shows suggestions to the host only', async () => {
    const { gameId } = await lobby(['ana'])
    await expectError(act('ana', { type: 'suggestions', gameId }), 403)
    expect(await act('host', { type: 'suggestions', gameId })).toEqual({ interests: [] })
  })

  it('keeps at most 5 interests per player', async () => {
    const { code } = await lobby([])
    await act('ana', { type: 'join', code, nickname: 'Ana', interests: ['running', 'cycling', 'swimming', 'hiking', 'travel', 'music', 'art'] })
    const entry = [...store.interests.values()].find((e) => e.interests.includes('running'))!
    expect(entry.interests).toHaveLength(5)
  })

  it('deletes interests as soon as the game starts', async () => {
    const { gameId, code } = (await act('host', { type: 'create', nickname: 'Host', settings: classic, interests: ['music'] })) as { gameId: string; code: string }
    await act('ana', { type: 'join', code, nickname: 'Ana', interests: ['music'] })
    await act('host', { type: 'start', gameId })
    expect(store.interests.size).toBe(0)
  })

  it('records round-trip time only in the lobby', async () => {
    const { gameId } = await lobby(['ana'])
    await act('host', { type: 'start', gameId })
    await act('ana', { type: 'ping', gameId, rttMs: 300 })
    expect([...store.players.values()].find((p) => p.nickname === 'ana')!.rttMs).toBe(0)
  })

  it('keeps tossup text, answer and source hidden until the reveal, releasing words in timed chunks', async () => {
    questions = tossupQuestions
    const { gameId } = await lobby(['ana'], { ...classic, format: 'tossup' })
    await act('host', { type: 'start', gameId })
    const q = (await store.getQuestion(gameId, 0))!
    expect(store.publicQuestion(q.id)).toMatchObject({ text: '', sourceNote: null, revealedAnswer: null })
    const chunks = store.chunks.get(q.id)!
    expect(chunks.map((c) => c.text).join(' ')).toBe(planTossup(tossupQuestions[0].text).words.join(' '))
    expect(chunks[0].offsetMs).toBe(0)
    expect(chunks[1].offsetMs).toBeGreaterThan(0)
    at(gameId, 999_999)
    await act('ana', { type: 'reveal', gameId })
    expect(store.publicQuestion(q.id)).toMatchObject({ text: tossupQuestions[0].text, sourceNote: '2017 POMMSS', revealedAnswer: 'Dublin' })
  })
})

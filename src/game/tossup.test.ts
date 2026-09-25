import { describe, expect, it } from 'vitest'
import { isPower, planTossup, tossupPoints, WORDS_PER_SECOND, wordsRevealed } from './tossup.ts'

const text = 'This city hosts the Easter Rising (*) and is the capital of Ireland.'

describe('planTossup', () => {
  it('removes the power mark and remembers where it was', () => {
    const plan = planTossup(text)
    expect(plan.words).not.toContain('(*)')
    expect(plan.words.slice(0, plan.powerIndex!).join(' ')).toBe('This city hosts the Easter Rising')
  })

  it('handles a power mark stuck to a word', () => {
    expect(planTossup('One two(*) three').powerIndex).toBe(2)
  })

  it('has no power index without a mark', () => {
    expect(planTossup('No mark here').powerIndex).toBeNull()
  })

  it('gives reading time for every word plus 5 seconds', () => {
    const plan = planTossup(text)
    expect(plan.readMs).toBe(Math.round((plan.words.length / WORDS_PER_SECOND) * 1000))
    expect(plan.limitMs).toBe(plan.readMs + 5000)
  })
})

describe('wordsRevealed', () => {
  const plan = planTossup(text)

  it('reveals words at reading speed', () => {
    expect(wordsRevealed(plan, 0)).toBe(0)
    expect(wordsRevealed(plan, 1000)).toBe(Math.ceil(WORDS_PER_SECOND))
  })

  it('never reveals more words than exist', () => {
    expect(wordsRevealed(plan, 999_999)).toBe(plan.words.length)
  })
})

describe('tossup scoring', () => {
  const plan = planTossup(text)
  const powerMs = (plan.powerIndex! / WORDS_PER_SECOND) * 1000

  it('treats answers before the power mark as power', () => {
    expect(isPower(plan, powerMs - 100)).toBe(true)
    expect(isPower(plan, powerMs + 400)).toBe(false)
  })

  it('adds the power bonus to speed points', () => {
    const early = tossupPoints({ correct: true, elapsedMs: 500, isFirstCorrect: false }, plan)
    const late = tossupPoints({ correct: true, elapsedMs: plan.readMs, isFirstCorrect: false }, plan)
    expect(early - late).toBeGreaterThan(200)
  })

  it('takes 50 points for a wrong answer', () => {
    expect(tossupPoints({ correct: false, elapsedMs: 500, isFirstCorrect: false }, plan)).toBe(-50)
  })

  it('gives nothing after the time limit', () => {
    expect(tossupPoints({ correct: true, elapsedMs: plan.limitMs + 1, isFirstCorrect: true }, plan)).toBe(0)
  })
})

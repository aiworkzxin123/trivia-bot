import { describe, expect, it } from 'vitest'
import { adjustedElapsed, DEFAULT_SCORING, scoreAnswer, speedPoints } from './scoring.ts'

describe('speedPoints', () => {
  const limit = 20_000

  it('gives full points for an instant answer', () => {
    expect(speedPoints(0, limit)).toBe(1000)
  })

  it('falls linearly to half points at the time limit', () => {
    expect(speedPoints(10_000, limit)).toBe(750)
    expect(speedPoints(20_000, limit)).toBe(500)
  })

  it('gives nothing after the time limit', () => {
    expect(speedPoints(20_001, limit)).toBe(0)
  })

  it('treats negative elapsed time as instant', () => {
    expect(speedPoints(-50, limit)).toBe(1000)
  })
})

describe('adjustedElapsed', () => {
  it('subtracts half the round-trip time', () => {
    expect(adjustedElapsed(5000, 200)).toBe(4900)
  })

  it('caps the adjustment at 150ms', () => {
    expect(adjustedElapsed(5000, 1000)).toBe(4850)
  })

  it('never goes below zero', () => {
    expect(adjustedElapsed(50, 200)).toBe(0)
  })
})

describe('scoreAnswer', () => {
  const base = { elapsedMs: 10_000, limitMs: 20_000, isFirstCorrect: false }

  it('scores a correct answer by speed', () => {
    expect(scoreAnswer({ ...base, correct: true })).toBe(750)
  })

  it('adds the first-correct bonus', () => {
    expect(scoreAnswer({ ...base, correct: true, isFirstCorrect: true })).toBe(850)
  })

  it('gives a wrong answer the configured penalty', () => {
    expect(scoreAnswer({ ...base, correct: false })).toBe(0)
    expect(scoreAnswer({ ...base, correct: false }, { ...DEFAULT_SCORING, wrongPenalty: 5 })).toBe(-5)
  })
})

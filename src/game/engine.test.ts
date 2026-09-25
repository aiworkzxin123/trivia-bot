import { describe, expect, it } from 'vitest'
import { buildAnswerline } from './answers/answerline.ts'
import { next, override, startGame, submit, timeout, type Question } from './engine.ts'

function question(id: string, answer: string, category = 'Geography'): Question {
  return { id, text: `Question ${id}?`, category, answer, answerline: buildAnswerline(answer, category) }
}

const questions = [question('q1', 'Paris'), question('q2', 'New Zealand')]
const settings = { timeLimitMs: 20_000, attempts: 2 }

describe('engine', () => {
  it('starts on the first question with full attempts', () => {
    const s = startGame(questions, settings, 1000)
    expect(s.phase).toBe('question')
    expect(s.index).toBe(0)
    expect(s.attemptsLeft).toBe(2)
    expect(s.questionStartedAt).toBe(1000)
  })

  it('scores a correct answer by speed and moves to the reveal', () => {
    const s = submit(startGame(questions, settings, 0), 'paris', 10_000)
    expect(s.phase).toBe('reveal')
    expect(s.results[0]).toMatchObject({ verdict: 'correct', points: 750 })
    expect(s.score).toBe(750)
  })

  it('uses up an attempt on a wrong answer and stays on the question', () => {
    const s = submit(startGame(questions, settings, 0), 'lyon', 2000)
    expect(s.phase).toBe('question')
    expect(s.attemptsLeft).toBe(1)
    expect(s.feedback).toBe('wrong')
  })

  it('reveals after the last attempt is wrong', () => {
    let s = startGame(questions, settings, 0)
    s = submit(s, 'lyon', 2000)
    s = submit(s, 'nice', 4000)
    expect(s.phase).toBe('reveal')
    expect(s.results[0]).toMatchObject({ verdict: 'wrong', points: 0, given: ['lyon', 'nice'] })
  })

  it('asks for more detail on a prompt without using an attempt', () => {
    let s = next(submit(startGame(questions, settings, 0), 'paris', 1000), 5000)
    s = submit(s, 'zealand', 6000)
    expect(s.phase).toBe('question')
    expect(s.feedback).toBe('prompt')
    expect(s.attemptsLeft).toBe(2)
    s = submit(s, 'new zealand', 7000)
    expect(s.results[1]).toMatchObject({ verdict: 'correct', elapsedMs: 2000 })
  })

  it('ignores answers after the time limit and reveals with zero points', () => {
    const s = submit(startGame(questions, settings, 0), 'paris', 21_000)
    expect(s.phase).toBe('reveal')
    expect(s.results[0]).toMatchObject({ verdict: 'wrong', points: 0 })
  })

  it('reveals with zero points on timeout', () => {
    const s = timeout(startGame(questions, settings, 0), 20_000)
    expect(s.phase).toBe('reveal')
    expect(s.results[0]).toMatchObject({ verdict: 'timeout', points: 0 })
  })

  it('lets a rejected answer be accepted, scored at its original time', () => {
    let s = startGame(questions, settings, 0)
    s = submit(s, 'paree', 4000)
    s = submit(s, 'parris france', 10_000)
    s = override(s)
    expect(s.results[0]).toMatchObject({ verdict: 'overridden', points: 750 })
    expect(s.score).toBe(750)
  })

  it('does not override a timeout with no answer', () => {
    const s = override(timeout(startGame(questions, settings, 0), 20_000))
    expect(s.results[0].verdict).toBe('timeout')
  })

  it('finishes after the last question', () => {
    let s = startGame(questions, settings, 0)
    s = next(submit(s, 'paris', 1000), 2000)
    s = next(submit(s, 'new zealand', 3000), 4000)
    expect(s.phase).toBe('finished')
    expect(s.results).toHaveLength(2)
  })
})

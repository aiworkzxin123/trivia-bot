import { describe, expect, it } from 'vitest'
import type { Question } from '../engine.ts'
import { displayCategory, pickQuestions } from './pool.ts'

function q(id: string, category: string): Question {
  return { id, text: id, category, answer: 'x', answerline: '' }
}

const pool = [q('a', 'Geography'), q('b', 'Geography'), q('c', 'History'), q('d', 'History'), q('e', 'Sports')]
const noShuffle = () => 0.999

describe('pickQuestions', () => {
  it('takes only the chosen categories', () => {
    const picked = pickQuestions(pool, { categories: ['History'], count: 5 }, new Set(), noShuffle)
    expect(picked.map((p) => p.id).sort()).toEqual(['c', 'd'])
  })

  it('takes every category when none are chosen', () => {
    expect(pickQuestions(pool, { categories: [], count: 10 }, new Set(), noShuffle)).toHaveLength(5)
  })

  it('stops at the requested count', () => {
    expect(pickQuestions(pool, { categories: [], count: 3 }, new Set(), noShuffle)).toHaveLength(3)
  })

  it('prefers questions the player has not seen', () => {
    const picked = pickQuestions(pool, { categories: [], count: 2 }, new Set(['a', 'b', 'c']), noShuffle)
    expect(picked.map((p) => p.id).sort()).toEqual(['d', 'e'])
  })

  it('falls back to seen questions when unseen ones run out', () => {
    const picked = pickQuestions(pool, { categories: ['Geography'], count: 2 }, new Set(['a']), noShuffle)
    expect(picked.map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('displayCategory', () => {
  it('drops the Entertainment and Science prefixes', () => {
    expect(displayCategory('Entertainment: Video Games')).toBe('Video Games')
    expect(displayCategory('Science: Computers')).toBe('Computers')
    expect(displayCategory('Science & Nature')).toBe('Science & Nature')
  })
})

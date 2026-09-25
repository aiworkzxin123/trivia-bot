import { describe, expect, it, vi } from 'vitest'
import { fetchTossups, tossupRequestUrls } from './sources.ts'

const tossup = (n: number) => ({
  _id: `t${n}`,
  question_sanitized: `Question ${n} (*) text`,
  answer: `<b><u>Answer ${n}</u></b>`,
  answer_sanitized: `Answer ${n}`,
  category: 'History',
  subcategory: 'European History',
  difficulty: 3,
  set: { name: '2017 POMMSS' },
})

describe('tossupRequestUrls', () => {
  it('spreads the count over the chosen categories', () => {
    const urls = tossupRequestUrls(['History', 'Sports'], 5, 'medium')
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('categories=History')
    expect(urls[0]).toContain('number=3')
    expect(urls[1]).toContain('subcategories=Sports')
    expect(urls[1]).toContain('number=2')
    expect(urls[0]).toContain('difficulties=3%2C4')
    expect(urls[0]).toContain('standardOnly=true')
  })

  it('asks for any category when none are chosen', () => {
    const urls = tossupRequestUrls([], 4, 'easy')
    expect(urls).toHaveLength(1)
    expect(urls[0]).not.toContain('categories=')
  })
})

describe('fetchTossups', () => {
  it('turns QBReader tossups into questions with their answerline and set name', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ tossups: [tossup(1), tossup(2)] })))
    const questions = await fetchTossups(['History'], 2, 'medium', fetchImpl)
    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({
      text: 'Question 1 (*) text',
      answer: 'Answer 1',
      answerline: '<b><u>Answer 1</u></b>',
      category: 'History',
      sourceNote: '2017 POMMSS',
    })
  })

  it('fails with a readable message when QBReader is down', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 503 }))
    await expect(fetchTossups([], 2, 'easy', fetchImpl)).rejects.toThrow(/QBReader/)
  })
})

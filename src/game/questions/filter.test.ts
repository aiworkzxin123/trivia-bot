import { describe, expect, it } from 'vitest'
import { isFreeTextFriendly } from './filter.ts'

function q(question: string, correct_answer = 'Paris', type = 'multiple') {
  return { type, question, correct_answer }
}

describe('isFreeTextFriendly', () => {
  it('keeps a plain question', () => {
    expect(isFreeTextFriendly(q('What is the capital of France?'))).toBe(true)
  })

  it('drops true/false questions', () => {
    expect(isFreeTextFriendly(q('Paris is in France.', 'True', 'boolean'))).toBe(false)
  })

  it.each([
    'Which of these cities is in France?',
    'Which one of the following is a French city?',
    'Which of the following is NOT in Europe?',
  ])('drops questions that need the choices: %s', (text) => {
    expect(isFreeTextFriendly(q(text))).toBe(false)
  })

  it.each([
    'What city is NOT a French capital?',
    "Which planet isn't a gas giant?",
  ])('drops negated questions: %s', (text) => {
    expect(isFreeTextFriendly(q(text))).toBe(false)
  })

  it('keeps lowercase "not" inside ordinary words and phrases', () => {
    expect(isFreeTextFriendly(q('What notable city hosts the Louvre?'))).toBe(true)
  })

  it('drops answers longer than four words', () => {
    expect(isFreeTextFriendly(q('Name the treaty.', 'The Treaty of the Pyrenees Signed'))).toBe(false)
  })

  it('drops questions on the blocklist', () => {
    expect(isFreeTextFriendly(q('What is the capital of France?'), new Set(['What is the capital of France?']))).toBe(false)
  })
})

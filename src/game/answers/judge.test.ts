import { describe, expect, it } from 'vitest'
import { buildAnswerline } from './answerline.ts'
import { judge } from './judge.ts'

function opentdb(answer: string, category = 'General Knowledge') {
  return { answer, answerline: buildAnswerline(answer, category) }
}

describe('judge with Open Trivia DB answers', () => {
  it.each([
    ['Iraq', 'iraq'],
    ['7', 'seven'],
    ['12', 'twelve'],
    ['The Beatles', 'beatles'],
    ['Pac-Man', 'pacman'],
    ['Pokémon', 'pokemon'],
    ['Jupiter', 'jupter'],
    ['Brazil', 'brasil'],
    ['Oxygen', 'oxigen'],
    ['Mount Everest', 'everest'],
  ])('accepts %s for "%s"', (answer, given) => {
    expect(judge(opentdb(answer), given).result).toBe('correct')
  })

  it.each([
    ['Iraq', 'iran'],
    ['1969', '1968'],
    ['Mercury', 'mars'],
    ['Au', 'ag'],
  ])('rejects %s for "%s"', (answer, given) => {
    expect(judge(opentdb(answer), given).result).toBe('wrong')
  })

  it('prompts on part of a multi-word answer', () => {
    expect(judge(opentdb('New Zealand', 'Geography'), 'zealand').result).toBe('prompt')
    expect(judge(opentdb('Albert Einstein', 'Science & Nature'), 'einstein').result).toBe('prompt')
  })

  it('accepts a surname in people categories', () => {
    expect(judge(opentdb('Albert Einstein', 'Celebrities'), 'einstein').result).toBe('correct')
  })

  it('needs the whole answer when it contains the word "or"', () => {
    const q = opentdb('Rock or Bust', 'Entertainment: Music')
    expect(judge(q, 'rock').result).toBe('wrong')
    expect(judge(q, 'rock or bust').result).toBe('correct')
    expect(judge(q, 'rock or bst').result).toBe('correct')
  })

  it.each([
    ['Final Fantasy X-2', 'final fantasy x-2'],
    ['A-1 Pictures', 'A-1 pictures'],
    ['8-12 years', '8-12 years'],
    ['?:', '?:'],
  ])('accepts an exact match the checker cannot parse: %s', (answer, given) => {
    expect(judge(opentdb(answer), given).result).toBe('correct')
  })

  it('does not accept a symbol-only answer for other symbols', () => {
    expect(judge(opentdb('?:'), '!!').result).toBe('wrong')
  })

  it('treats an empty answer as wrong', () => {
    expect(judge(opentdb('Paris'), '   ').result).toBe('wrong')
  })
})

describe('judge with QBReader answerlines', () => {
  const leonardo = {
    answer: 'Leonardo da Vinci',
    answerline: '<b><u>Leonardo</u></b> da Vinci [accept Leonardo; prompt on da Vinci]',
  }

  it('follows accept, prompt and reject directives', () => {
    expect(judge(leonardo, 'leonardo').result).toBe('correct')
    expect(judge(leonardo, 'da vinci').result).toBe('prompt')
    expect(judge(leonardo, 'michelangelo').result).toBe('wrong')
  })

  it('accepts a typo', () => {
    expect(judge(leonardo, 'leonardo da vinchi').result).toBe('correct')
  })
})

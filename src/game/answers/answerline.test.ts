import { describe, expect, it } from 'vitest'
import { buildAnswerline } from './answerline.ts'

describe('buildAnswerline', () => {
  it('requires the full answer and prompts on part of it', () => {
    expect(buildAnswerline('New Zealand', 'Geography')).toBe('<b><u>New Zealand</u></b> [prompt on partial]')
  })

  it('does not add directives to one-word answers', () => {
    expect(buildAnswerline('Jupiter', 'Science & Nature')).toBe('<b><u>Jupiter</u></b>')
  })

  it('accepts the answer without a leading article', () => {
    expect(buildAnswerline('The Beatles', 'Entertainment: Music')).toBe('<b><u>The Beatles</u></b> [accept Beatles]')
  })

  it('accepts a surname alone in people categories', () => {
    expect(buildAnswerline('Albert Einstein', 'Celebrities')).toBe('<b><u>Albert Einstein</u></b> [accept Einstein]')
  })

  it('accepts a place name without a geographic prefix', () => {
    expect(buildAnswerline('Mount Everest', 'Geography')).toBe('<b><u>Mount Everest</u></b> [accept Everest]')
  })

  it('does not treat place words as surnames', () => {
    expect(buildAnswerline('United Kingdom', 'History')).toBe('<b><u>United Kingdom</u></b> [prompt on partial]')
  })

  it('removes characters that the answerline format reserves', () => {
    expect(buildAnswerline('Guns [N] Roses; live', 'Entertainment: Music')).toBe('<b><u>Guns N Roses live</u></b> [prompt on partial]')
  })

  it('returns no answerline when the answer contains the word "or"', () => {
    expect(buildAnswerline('Rock or Bust', 'Entertainment: Music')).toBe('')
  })
})

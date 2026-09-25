import { describe, expect, it } from 'vitest'
import { editDistance, normalize, typoAllowance } from './normalize.ts'

describe('normalize', () => {
  it('lowercases, strips accents, punctuation and extra spaces', () => {
    expect(normalize('  Pokémon: Red!  ')).toBe('pokemon red')
  })

  it('drops a leading article', () => {
    expect(normalize('The Beatles')).toBe('beatles')
    expect(normalize('an Apple')).toBe('apple')
  })

  it('keeps an article that is the whole answer', () => {
    expect(normalize('The')).toBe('the')
  })

  it('turns hyphens into spaces', () => {
    expect(normalize('Pac-Man')).toBe('pac man')
  })
})

describe('editDistance', () => {
  it('counts single edits', () => {
    expect(editDistance('jupiter', 'jupter')).toBe(1)
    expect(editDistance('brazil', 'brasil')).toBe(1)
  })

  it('counts a swap of neighbouring letters as one edit', () => {
    expect(editDistance('oxygen', 'oxgyen')).toBe(1)
  })

  it('is zero for equal strings', () => {
    expect(editDistance('paris', 'paris')).toBe(0)
  })
})

describe('typoAllowance', () => {
  it('allows no typos in short answers', () => {
    expect(typoAllowance('iraq')).toBe(0)
  })

  it('allows one typo from 5 letters and two from 9', () => {
    expect(typoAllowance('brazil')).toBe(1)
    expect(typoAllowance('mississippi')).toBe(2)
  })

  it('allows no typos in answers with digits', () => {
    expect(typoAllowance('1969 moon')).toBe(0)
  })
})

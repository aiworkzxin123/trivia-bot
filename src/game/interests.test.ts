import { describe, expect, it } from 'vitest'
import { INTERESTS, suggestCategories } from './interests.ts'
import { OPENTDB_CATEGORIES } from './questions/categories.ts'
import { TOSSUP_CATEGORIES } from './questions/sources.ts'

describe('INTERESTS', () => {
  it('maps only to real Open Trivia DB categories', () => {
    for (const i of INTERESTS) for (const c of i.classic) expect(OPENTDB_CATEGORIES).toContain(c)
  })

  it('maps only to real tossup categories', () => {
    const ids = TOSSUP_CATEGORIES.map((c) => c.id)
    for (const i of INTERESTS) for (const c of i.tossup) expect(ids).toContain(c)
  })
})

describe('suggestCategories', () => {
  it('turns shared interests into categories for the format, most shared first, without repeats', () => {
    expect(suggestCategories(['cycling', 'hiking'], 'classic')).toEqual([
      'Sports', 'Geography', 'Science & Nature', 'Animals',
    ])
    expect(suggestCategories(['reading'], 'tossup')).toEqual(['Literature'])
  })

  it('ignores unknown interests', () => {
    expect(suggestCategories(['juggling'], 'classic')).toEqual([])
  })
})

describe('OPENTDB_CATEGORIES', () => {
  it('matches the categories in the built question file', async () => {
    const { readFile } = await import('node:fs/promises')
    const file = JSON.parse(await readFile('public/questions/opentdb.json', 'utf8')) as { categories: { name: string }[] }
    expect([...OPENTDB_CATEGORIES].sort()).toEqual(file.categories.map((c) => c.name).sort())
  })
})

import { describe, expect, it } from 'vitest'
import { href, parseRoute } from './router.ts'

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/solo', { name: 'solo' }],
    ['#/host', { name: 'host' }],
    ['#/join/abcde', { name: 'join', code: 'ABCDE' }],
    ['#/join', { name: 'join', code: '' }],
    ['#/game/1234-uuid', { name: 'game', gameId: '1234-uuid' }],
    ['#/game', { name: 'home' }],
    ['#/about', { name: 'about' }],
    ['#/nonsense', { name: 'home' }],
  ])('parses %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route)
  })

  it('round-trips through href', () => {
    const route = { name: 'join', code: 'QWERT' } as const
    expect(parseRoute(href(route))).toEqual(route)
  })
})

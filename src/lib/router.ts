/**
 * Hash routes, so GitHub Pages serves every screen from index.html:
 * #/  #/solo  #/host  #/join/CODE  #/game/ID  #/about
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'solo' }
  | { name: 'host' }
  | { name: 'join'; code: string }
  | { name: 'game'; gameId: string }
  | { name: 'about' }

export function parseRoute(hash: string): Route {
  const [, name = '', arg = ''] = hash.replace(/^#/, '').split('/')
  switch (name) {
    case 'solo':
      return { name: 'solo' }
    case 'host':
      return { name: 'host' }
    case 'join':
      return { name: 'join', code: decodeURIComponent(arg).toUpperCase() }
    case 'game':
      return arg ? { name: 'game', gameId: decodeURIComponent(arg) } : { name: 'home' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'home' }
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'join':
      return `#/join/${encodeURIComponent(route.code)}`
    case 'game':
      return `#/game/${encodeURIComponent(route.gameId)}`
    default:
      return `#/${route.name}`
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route)
}

/** Full link to a route, e.g. for sharing an invite. */
export function absoluteUrl(route: Route): string {
  return `${window.location.origin}${window.location.pathname}${href(route)}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

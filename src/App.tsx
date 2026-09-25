import { useRoute } from './lib/router.ts'
import { About } from './ui/About.tsx'
import { GameScreen } from './ui/multi/GameScreen.tsx'
import { Home, HostForm, JoinForm } from './ui/multi/Entry.tsx'
import { Solo } from './ui/solo/Solo.tsx'

export default function App() {
  const route = useRoute()

  let screen
  switch (route.name) {
    case 'solo':
      screen = <Solo />
      break
    case 'host':
      screen = <HostForm />
      break
    case 'join':
      screen = <JoinForm key={route.code} code={route.code} />
      break
    case 'game':
      screen = <GameScreen key={route.gameId} gameId={route.gameId} />
      break
    case 'about':
      screen = <About />
      break
    default:
      screen = <Home />
  }

  return (
    <div className="app">
      <main id="main">{screen}</main>
      <footer className="credits">
        Questions from <a href="https://opentdb.com">Open Trivia DB</a> (CC BY-SA 4.0) and quiz bowl sets via{' '}
        <a href="https://www.qbreader.org">QBReader</a>. <a href="#/about">About and credits</a>
      </footer>
    </div>
  )
}

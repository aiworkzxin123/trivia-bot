/** Attribution, scoring rules and privacy notes. */
import { POWER_BONUS, WORDS_PER_SECOND } from '../game/tossup.ts'

export function About() {
  return (
    <article className="about">
      <header className="setup-head">
        <a className="back" href="#/">
          ← Home
        </a>
        <h1>About Trivia Bot</h1>
      </header>

      <section>
        <h2>Where the questions come from</h2>
        <p>
          <b>Classic questions</b> come from <a href="https://opentdb.com">Open Trivia DB</a>, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0</a>. Trivia Bot keeps the 3,666 of its
          5,298 verified questions that work without answer choices, and turns each answer into a quiz bowl answerline so typed answers can be
          checked. That filtered set is shared under the same licence.
        </p>
        <p>
          <b>Quiz bowl tossups</b> are real competition questions from tournaments archived on{' '}
          <a href="https://quizbowlpackets.com">quizbowlpackets.com</a>, served by <a href="https://www.qbreader.org">QBReader</a>. The questions
          belong to their tournament writers; each one is credited with its set name when its answer is revealed, and they're fetched live rather
          than copied.
        </p>
        <p>
          Answers are judged with <a href="https://github.com/qbreader/qb-answer-checker">qb-answer-checker</a> (ISC licence) by Geoffrey Wu, plus a
          few extra rules for typos, numbers and surnames.
        </p>
      </section>

      <section>
        <h2>Scoring</h2>
        <ul>
          <li>
            <b>Classic:</b> a correct answer scores 1000 points, falling steadily to 500 at the time limit. The first player to get it right gets +100.
            You get 2 tries.
          </li>
          <li>
            <b>Tossups:</b> the question appears at about {WORDS_PER_SECOND} words a second. A correct answer scores up to 1000, falling as more words
            appear; answering before the power mark earns +{POWER_BONUS}. You get 1 try, and a wrong answer costs 50.
          </li>
          <li>Times are measured by the server, with a small allowance for each player's connection speed (up to 0.15 seconds).</li>
          <li>The host can accept an answer that was wrongly rejected. It then scores as if it had been accepted when it was sent.</li>
        </ul>
      </section>

      <section>
        <h2>Privacy</h2>
        <ul>
          <li>You play without an account. Your browser gets an anonymous ID so the game knows which answers are yours.</li>
          <li>
            Interests you tick (up to 5) are only used to suggest categories to the host, who sees category names, never who picked what.
            Interests are deleted as soon as the game starts.
          </li>
          <li>Games, names and answers are deleted a day after the game was created.</li>
          <li>Trivia Bot doesn't connect to your Instagram or Strava account. You invite followers by sharing the game link.</li>
        </ul>
      </section>

      <section>
        <h2>Fair play</h2>
        <p>
          Answers stay on the server until each question is revealed, and quiz bowl questions arrive a few words at a time. Both question banks are
          public, though, so someone determined could look answers up. After each question everyone sees what everyone typed, and the host can
          accept answers, so it works best with people you know.
        </p>
      </section>
    </article>
  )
}

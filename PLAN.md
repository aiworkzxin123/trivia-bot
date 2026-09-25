# Trivia Bot: Plan

A web app for multiplayer trivia, hosted on GitHub Pages. A user invites their Instagram and Strava followers to a game. Questions come from standard competition question sets, and players type their answers. A faster correct answer earns more points. Players pick the categories, and the app suggests categories based on the Strava activities the players in a game have in common.

---

## 1. Platform limits that shape the design

These have not been checked against today's docs yet. Phase 0 confirms them before any building.

1. **Instagram won't give you a follower list.** The consumer Instagram API (Basic Display) was shut down in Dec 2024. The Graph API only works for Business/Creator accounts, and even then it gives a follower *count*, not the followers themselves.
   → **Instead:** send invites as a shareable link or QR code posted to a Story, bio or DM. The phone's native share menu (the Web Share API) handles this.
2. **Strava has no followers endpoint either.** It was removed from API v3 years ago.
   → **Instead:** each player connects their own Strava when they join, and the app compares activity types across the players in the game.
3. **Strava's 2024 API terms limit showing one user's data to other users.**
   → **Instead:** do the Strava work on a server and send the group only derived category suggestions. No one's raw activities ever reach another player. Check this against the current Strava API Agreement.
4. **GitHub Pages only serves static files.** Strava login needs a client secret, live multiplayer needs a realtime server, and answers must be checked where players can't see them. A **small backend** is required. Supabase's free tier covers all three.

---

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript, `HashRouter` | Static build; hash routes work on Pages without the 404 trick |
| Hosting | GitHub Pages, deployed by GitHub Actions | Requirement |
| Auth, DB, realtime | Supabase (Postgres + Realtime channels + anonymous auth) | Free tier; live lobby and game state |
| Server logic | Supabase Edge Functions | Strava login and data fetching, answer checking, scoring. Keeps secrets and correct answers off the client |
| Questions | QBReader (main), Open Trivia DB (secondary) | See §3 |

---

## 3. Question sources (typed answers, no multiple choice)

- **QBReader** (qbreader.org), the main source.
  - Real quiz bowl packets from ACF/NAQT-style competitions. They are free-text by design.
  - Each question comes with an "answerline" that lists what to accept, what to accept only after asking for more detail, and what to reject. Example: `Leonardo da Vinci [accept Leonardo; prompt on da Vinci]`.
  - QBReader has an answer-checking API and an open-source checker library (`qb-answer-checker`). Reuse these instead of writing matching from scratch.
  - *To check:* the terms of use, and whether it allows browser (CORS) requests. If it doesn't, call it through an Edge Function.
- **Open Trivia DB** (opentdb.com), the secondary source.
  - CC BY-SA 4.0, so it must be credited.
  - Show only the question and keep the correct answer server-side.
  - Filter out questions that don't work without choices: "Which of these…", "Which of the following…", true/false, and questions with long answers. Filter automatically with patterns, and keep a manual blocklist.
  - Store the filtered set as static JSON built by a nightly GitHub Action. This also avoids Open Trivia DB's rate limit (1 request per 5 seconds).
- **Avoid:** J-Archive/Jeopardy and Learned League content, because of copyright.
- Add an attribution page in the app.

---

## 4. Question formats

1. **Classic pub-quiz:** a short question shown all at once with a timer (default 20s).
2. **Quiz bowl tossup (competition mode):**
   - The question text appears word by word, and players can answer mid-question.
   - Answering before a marked point (a "power" answer) earns bonus points.
   - A wrong answer locks the player out for that question and costs a small penalty (−5), as in real quiz bowl.

---

## 5. Answer checking (on the server)

All checking happens in an Edge Function, so the correct answer never reaches players' browsers. Steps, in order:

1. **Normalize:** lowercase, strip accents, punctuation and leading "the/a/an", collapse spaces, convert number words to digits ("seven" → "7").
2. **Exact match** against the main answer and every accepted alternative.
3. **Fuzzy match:** allow a few typos, with the tolerance growing with answer length. Short answers must be exact, so "Iran" can't pass as "Iraq".
4. **Surname rule:** a person's last name alone counts, unless the answerline says to ask for more.
5. **Prompts:** if the answerline says to prompt, the player gets "more specific?" and can answer again without losing their place in time.
6. **Host override:** at the end of each question, the host sees rejected answers and can accept them. Scores are recalculated using the original submission time.

---

## 6. Scoring

- **The server records all times.** Question start is when the question is broadcast; answer time is when the server receives the answer. Clients can't fake their own timing.
- **Speed formula:**
  - `points = round(1000 × (1 − 0.5 × elapsed / time_limit))`
  - A correct answer earns between 1000 and 500 depending on speed; late or wrong answers earn 0.
  - These are starting values; tune the constants in playtesting.
- **First-correct bonus:** +100 for the first correct answer.
- **Attempts:**
  - Classic mode: 2 attempts, with no points for a wrong one.
  - Tossup mode: 1 attempt, with the −5 penalty.
- **Latency:** each client's round-trip time is measured in the lobby, and half of it is subtracted from their elapsed time, capped at 150ms. This stops players far from the server from being penalized.
- **Live feed:** everyone sees "⚡ Sam got it (2.1s)" but not the answer.
- **Early end:** a classic-mode question ends as soon as every player has answered correctly or used up their attempts. This is the default and can be changed.

---

## 7. Data model (Supabase)

- `games`: id, code, host_id, status, settings, scoring_config, current_question_idx, question_started_at
- `players`: game_id, user_id, nickname, score, strava_connected, rtt_ms
- `questions`: game_id, round, category, format (classic/tossup), text, power_mark_idx, answerline_raw, accept[], prompt[], reject[]
  - Only the server can read the answer columns (row-level security).
- `answers`: question_id, player_id, answer, attempt_no, server_received_at, verdict (correct/prompt/wrong/overridden), points
- `strava_tokens`: user_id, encrypted refresh token. Only Edge Functions can read it.
- `category_affinity`: game_id, category, score, reason. This is the only Strava-derived data other players see.

---

## 8. Strava category suggestions

1. A player clicks "Connect Strava" and goes through OAuth (scope `activity:read`). An Edge Function swaps the code for tokens.
2. The function pulls the player's last ~90 days of activities and counts each `sport_type`.
3. It maps activity types to trivia categories through a config table:
   - Run → Sports/Athletics, marathons, Olympics
   - Ride / GravelRide → Tour de France, Geography (Europe)
   - Swim → Olympics, Science: Nature
   - Hike / TrailRun → Geography, Science: Nature
   - AlpineSki / Snowboard → Winter Olympics, Geography
   - Yoga → Mythology, History (optional, more playful mappings)
4. **Group score:** for each category, (number of players who share it) × (activity weight). Categories shared by more players rank higher.
5. The lobby shows e.g. "Suggested for this group: Cycling & Geography (4 of 5 players ride)." Players still choose or vote on the categories themselves.
6. Optional: use country-level activity locations, computed on the server, for geography suggestions. Treat this as privacy-sensitive and make it opt-in.
7. Include a "disconnect Strava and delete my data" option.

Connecting Strava is **optional**. Players can join without it.

---

## 9. Game flow

1. The host creates a game and gets a code, a link and a QR code.
2. The host shares it to Instagram or Strava through the share menu or by copying the link. Open Graph tags make the link preview look good.
3. Players join with a nickname and can optionally connect Strava.
4. The lobby shows the category suggestions and measures each player's round-trip time. Players vote on categories, and the host sets the format, number of rounds and timer.
5. Questions are sent over Realtime. Players type answers, and the server checks them, records the time and scores them. The live feed updates.
6. After each question, the host reviews rejected answers and can override them. Then the answer is revealed.
7. The game ends with a leaderboard.

---

## 10. Phases

0. **Check and set up**
   - Confirm the limits in §1 and QBReader's terms, CORS support and answer-checking API.
   - Register the Strava API app and create the Supabase project.
   - Set up the repo and the GitHub Pages deploy workflow.
1. **Core logic and single-player MVP**
   - Build the answer matcher and scoring formula first, test-first, as pure TypeScript modules. Test with real QBReader answerlines and messy typed answers.
   - Build the Open Trivia DB filter and the nightly JSON build.
   - Add a single-player classic mode with a category picker and timer. Deploy to Pages.
2. **Multiplayer**
   - Supabase anonymous auth, lobby, Realtime game state.
   - Server-side answer function with server timestamps and latency adjustment.
   - Host override screen, live feed, leaderboard.
3. **Invites**
   - Game codes, links, QR codes, share menu, Open Graph tags.
4. **Strava**
   - OAuth Edge Function, activity mapping, group affinity scores, suggestion UI, data deletion.
5. **Competition mode**
   - QBReader tossups with word-by-word reveal, power bonus, wrong-answer penalty.
   - Attribution page.
6. **Hardening**
   - End-to-end tests with several simulated players.
   - Rate limiting, security review of token handling and answer secrecy.
   - Accessibility and mobile typing experience.

---

## 11. Helpful Claude Code skills

- **`research`**: Phase 0. Checks the Instagram, Strava and QBReader facts against primary sources and saves the findings to the repo.
- **`wizard`**: walks through the steps only a person can do: Strava app registration, Supabase keys, GitHub Pages and Actions secrets.
- **`domain-modeling`**: sets up a CONTEXT.md vocabulary (Game, Round, Tossup, Answerline, Prompt, Affinity) before coding.
- **`tdd`**: for the answer matcher (typos, surnames, numbers, near-miss country names), scoring and affinity logic.
- **`prototype`**: try the lobby and the typing-under-time-pressure feel on mobile before committing to timer lengths.
- **`setup-pre-commit`**: Husky, Prettier and type checks.
- **`claude-in-chrome`** / **`run`**: drive the deployed app in a browser to check multiplayer flows.
- **`security-review`** and **`code-review`**: before shipping the OAuth, token and answer-checking code.
- **`git-guardrails-claude-code`** (optional): blocks destructive git commands while agents work.

## 12. MCP servers to consider installing

- **Supabase MCP** (official): create tables and row-level security policies, run SQL, deploy Edge Functions.
- **GitHub MCP** (official): repo, Actions and Pages setup, and debugging failed deploys.
- **Playwright MCP** (Microsoft): automated multi-browser tests. Several tabs act as several players answering at different moments, to check scoring order.
- **Context7**: up-to-date docs for Supabase, Vite and React Router.
- A Strava MCP isn't needed. The app talks to Strava's REST API directly.

---

## 13. Open decisions

- Supabase or Firebase? Supabase is assumed; both work.
- Should classic mode run the full timer instead of ending early? Early end is assumed.
- Is the −5 wrong-answer penalty in tossup mode kept, or are wrong answers penalty-free for casual play?

# Trivia Bot: Plan

A web app for multiplayer trivia, hosted on GitHub Pages. A user invites their Instagram and Strava followers to a game with a share link. Questions come from standard competition question sets, and players type their answers. A faster correct answer earns more points. Players pick the categories, and the app suggests categories based on the interests the players in a game have in common.

Platform facts behind this plan, with sources: [docs/research/phase0-platform-facts.md](docs/research/phase0-platform-facts.md).

---

## 1. Platform limits that shape the design

Checked against primary sources on 2026-09-25 (Phase 0).

1. **Instagram won't give you a follower list.** The Basic Display API was shut down on Dec 4, 2024. The remaining Instagram APIs work only with Business/Creator accounts, and even then give only a follower *count*.
   → Invites are a shareable link or QR code posted to a Story, bio or DM through the phone's native share menu (the Web Share API).
2. **Strava has no followers endpoint.** Club member endpoints were also removed on Sept 1, 2026.
   → Strava followers are invited the same way: by sharing the link.
3. **The app does not connect to the Strava API.** Reasons:
   - Creating a Strava API app now requires a paid Strava subscription.
   - New apps are capped at 10 connected athletes without a review by Strava.
   - The June 1, 2026 API terms allow showing one user's data only to that user, unless they give explicit consent.

   → Players **pick their own interests** when they join, and the suggestions are based on those (§8). Strava auto-fill can be revisited later (§13).
4. **GitHub Pages only serves static files.** Live multiplayer needs a realtime server, and answers must be checked where players can't see them. A **small backend** is required. Supabase's free tier covers both.

---

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript, `HashRouter` | Static build; hash routes work on Pages without the 404 trick |
| Hosting | GitHub Pages, deployed by GitHub Actions | Live at https://aiworkzxin123.github.io/trivia-bot/ |
| Auth, DB, realtime | Supabase (Postgres + Realtime channels + anonymous auth) | Free tier: 200 concurrent connections, 2M messages per month |
| Server logic | Supabase Edge Functions | Question fetching, answer checking, scoring. Keeps correct answers off the client |
| Questions | QBReader (tossup mode), Open Trivia DB (classic mode) | See §3 |

Supabase housekeeping:
- **Keep-alive:** free projects pause after 7 days without activity. A scheduled GitHub Action pings the project to prevent this.
- **Sign-in limits:** anonymous sign-ins are limited to 30 per hour per IP by default. Raise the limit and add a Cloudflare Turnstile check against abuse.

---

## 3. Question sources (typed answers, no multiple choice)

- **QBReader** (`https://www.qbreader.org/api`), used for **tossup mode**.
  - Real quiz bowl questions from ACF/NAQT-style competitions. They are long paragraphs with a power mark `(*)` and an "answerline" listing what to accept, what to accept only after asking for more detail, and what to reject.
  - Fetch through an Edge Function with `/random-tossup` (`standardOnly=true`, difficulty filter), so the answer never reaches the browser, even though QBReader allows browser requests (CORS).
  - Rate limit: 20 requests per second.
  - Licensing: QBReader's own content is MIT, but the questions belong to the tournament authors (quizbowlpackets.com). Fetch them live with credit instead of bulk-copying.
  - Categories are academic: Literature, History, Science, Fine Arts, Religion, Mythology, Philosophy, Social Science, Geography, Current Events, Other Academic, and Pop Culture (Movies, Music, Sports, Television, Video Games).
- **Open Trivia DB** (opentdb.com), used for **classic mode**.
  - CC BY-SA 4.0: the app must credit it, and the filtered JSON derived from it stays under the same licence.
  - It has 5,298 verified questions. About 3,400 are usable once these are removed: true/false, "Which of these/of the following", negated ("NOT"), answers longer than 4 words, and a manual blocklist.
  - The pool leans toward Video Games (~778 questions) and is thin on Sports (~139).
  - Build the filtered set as static JSON with a one-off or weekly GitHub Action that uses a session token. This respects the rate limit of 1 request per 5 seconds.
- **Avoid:** J-Archive/Jeopardy and Learned League content, because of copyright.
- Add an attribution page in the app.
- Adding more question sources is postponed until after playtesting.

---

## 4. Question formats

1. **Classic pub-quiz** (Open Trivia DB): a short question shown all at once with a timer (default 20s).
2. **Quiz bowl tossup, competition mode** (QBReader):
   - The question text appears word by word, and players can answer mid-question.
   - Answering before the `(*)` power mark earns bonus points.
   - A wrong answer locks the player out for that question and costs a small penalty (−5), as in real quiz bowl.

---

## 5. Answer checking (on the server)

All checking happens in an Edge Function, so the correct answer never reaches players' browsers.

- **Checker:** the `qb-answer-checker` library (ISC licence).
  - `checkAnswer(answerline, givenAnswer)` returns `accept`, `prompt` (with an optional directed prompt such as "what specific fluid?"), or `reject`.
  - It handles typos, accept/prompt/reject rules, "prompt on partial", and the required-part markup.
  - It runs inside the Edge Function instead of calling QBReader's HTTP check-answer API.
- **Open Trivia DB answers** are wrapped as simple answerlines and run through the same checker.
  - Our own rules are added only where the checker falls short, checked in this order:
  1. **Normalize:** lowercase, strip accents, punctuation and leading "the/a/an", convert number words to digits ("seven" → "7").
  2. **Short answers must be exact**, so "Iran" can't pass as "Iraq".
  3. **Surname rule:** a person's last name alone counts.
- **Prompts:** when the answer is a prompt, the player sees "more specific?" and can answer again without losing their place in time.
- **Host override:** at the end of each question, the host sees rejected answers and can accept them. Scores are recalculated using the original submission time.

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
- **Latency:** each client's round-trip time is measured in the lobby, and half of it is subtracted from their elapsed time, capped at 150ms.
- **Live feed:** everyone sees "⚡ Sam got it (2.1s)" but not the answer.
- **Early end:** a classic-mode question ends as soon as every player has answered correctly or used up their attempts.

---

## 7. Data model (Supabase)

- `games`: id, code, host_id, status, settings, scoring_config, current_question_idx, question_started_at
- `players`: game_id, user_id, nickname, score, rtt_ms, interests[] (only the server can read it; deleted when the game ends)
- `questions`: game_id, round, category, format (classic/tossup), source, text, power_mark_idx, answerline
  - Only the server can read the answerline (row-level security).
- `answers`: question_id, player_id, answer, attempt_no, server_received_at, verdict (correct/prompt/wrong/overridden), points
- `category_suggestions`: game_id, category, label. Category names only, with no counts or player names. Deleted when the game ends.

---

## 8. Interest-based category suggestions

1. When joining, each player can tick interests from a fixed list. This is optional and can be skipped.
2. Interests map to real question categories through a config table:

   | Interest | Open Trivia DB (classic) | QBReader (tossup) |
   |---|---|---|
   | Running / Cycling / Swimming / Team sports | Sports | Pop Culture › Sports |
   | Hiking / Outdoors | Geography, Science & Nature, Animals | Geography, Science |
   | Skiing / Snow sports | Sports, Geography | Pop Culture › Sports, Geography |
   | Travel | Geography, History | Geography, History |
   | Cars / Motorsport | Vehicles, Sports | Pop Culture › Sports |
   | Movies / TV | Film, Television | Pop Culture › Movies, Television |
   | Music | Music, Musicals & Theatres | Pop Culture › Music, Fine Arts |
   | Reading | Books | Literature |
   | Science / Tech | Science & Nature, Computers, Mathematics, Gadgets | Science |
   | History / Politics | History, Politics | History, Social Science |
   | Gaming | Video Games, Board Games | Pop Culture › Video Games |
   | Art | Art | Fine Arts |
   | Myths / Religion | Mythology | Mythology, Religion |
   | Anime / Comics | Anime & Manga, Comics, Cartoons | Pop Culture › Other |

   Flavour labels such as "Endurance sports" or "Tour de France" can be shown on a suggestion, but they are not question categories.
3. **Group score:** for each category, count how many players' interests map to it. Categories shared by more players rank higher.
4. **Privacy:**
   - The lobby shows **category names only**, with no counts and no names.
   - A category is suggested only when **at least 2 players** share it.
   - Interests are **deleted when the game starts**, and each player can pick at most 5.
5. Players still choose or vote on the categories themselves. Suggestions are only a starting point.

---

## 9. Game flow

1. The host creates a game and gets a code, a link and a QR code.
2. The host shares it to Instagram or Strava through the share menu or by copying the link. Open Graph tags make the link preview look good.
3. Players join with a nickname and can optionally tick interests.
4. The lobby shows the category suggestions and measures each player's round-trip time. Players vote on categories, and the host sets the format, number of rounds and timer.
5. Questions are sent over Realtime. Players type answers, and the server checks them, records the time and scores them. The live feed updates.
6. After each question, the host reviews rejected answers and can override them. Then the answer is revealed.
7. The game ends with a leaderboard, and interests and suggestions are deleted.

---

## 10. Phases

0. **Check and set up** ✅ *done 2026-09-25*
   - Platform facts checked ([research notes](docs/research/phase0-platform-facts.md)); plan updated.
   - Vite + React + TS app, GitHub repo, and Pages deploy workflow set up; site is live.
1. **Core logic and single-player MVP** ✅ *done 2026-09-25*
   - Answer checking (`qb-answer-checker` plus our own rules) and speed scoring, built test-first.
   - 3,666 Open Trivia DB questions kept; every one accepts its own answer.
   - Single-player classic mode deployed.
2. **Multiplayer** ✅ *live 2026-09-25 (Supabase project in Singapore, ap-southeast-1)*
   - Game service with every server-side rule, tested with simulated players (`src/server/service.test.ts`).
   - Supabase schema with read-only access rules, one server function, setup script (`scripts/setup-supabase.sh`), daily keep-alive and cleanup.
   - Lobby, live question with server-synced timer, live feed, host override, leaderboard.
   - Turnstile support is built in but off until a Cloudflare site key is added.
3. **Invites** ✅ *done 2026-09-25*
   - 5-letter game codes, invite links, QR codes, share sheet, link preview image.
4. **Interest-based suggestions** ✅ *done 2026-09-25*
   - Up to 5 interests per player; the host sees categories 2+ players share (names only); interests deleted when the game starts.
5. **Competition mode** ✅ *done 2026-09-25*
   - QBReader tossups revealed word by word, +200 power bonus, −50 wrong, 1 try, in solo and multiplayer; set credit on reveal; About page.
6. **Hardening** 🟡 *nearly done*
   - ✅ Security review (see below) and fixes.
   - ✅ Rate limits: 10 games per host per hour, 10 answers per question, 2 "more specific?" hints, 50 players, 60 anonymous sign-ins per IP per hour.
   - ✅ Accessibility basics: labels, live regions, visible focus, reduced motion, 16px+ inputs so phones don't zoom.
   - ✅ End-to-end check against the real backend (`npm run smoke`, 39 checks): a host and a guest play classic and tossup games, including simultaneous answers and the access rules.
   - ⏳ Hands-on test of the live screens with two devices.

### Security decisions (from the Phase 6 review)

- **Answers are recorded in one database step** (`record_answer`), so answers sent at the same moment can't score twice or get around the attempt limits. Host overrides work the same way (`override_answer`).
- **Nothing is readable early.** A question becomes readable at its start time, not during the countdown. Tossup words are released a few at a time (`question_chunks`). The answer, full text and tournament name are copied in only at the reveal.
- **Interests** are capped at 5, shown only to the host, and deleted at the start. A host with fake accounts could still probe a few of one player's interests; the stakes are low (interests like "Cycling").
- **Accepted risk:** both question banks are public, so a determined player could look answers up. Everyone sees what everyone typed after each question, and the About page says the game works best with people you know.
- **Later:** pin GitHub Actions to commit hashes; make Turnstile required once a Cloudflare key exists.

---

## 11. Helpful Claude Code skills

- **`wizard`**: walks through the Supabase project setup and the GitHub Actions secrets in Phase 2.
- **`domain-modeling`**: sets up a CONTEXT.md vocabulary (Game, Round, Tossup, Answerline, Prompt, Interest, Suggestion) before coding.
- **`tdd`**: for answer checking (typos, surnames, numbers, near-miss country names), scoring and suggestion logic.
- **`prototype`**: try the lobby and the typing-under-time-pressure feel on mobile before committing to timer lengths.
- **`setup-pre-commit`**: Husky, Prettier and type checks.
- **`claude-in-chrome`** / **`run`**: drive the deployed app in a browser to check multiplayer flows.
- **`security-review`** and **`code-review`**: before shipping the answer-checking and auth code.
- **`research`**: for any further platform questions.
- **`git-guardrails-claude-code`** (optional): blocks destructive git commands while agents work.

## 12. MCP servers to consider installing

- **Supabase MCP** (official): create tables and row-level security policies, run SQL, deploy Edge Functions.
- **GitHub MCP** (official): repo, Actions and Pages management. The `gh` CLI already covers most of this.
- **Playwright MCP** (Microsoft): automated multi-browser tests. Several tabs act as several players answering at different moments, to check scoring order.
- **Context7**: up-to-date docs for Supabase, Vite and React Router.

---

## 13. Open decisions

- **Wrong-answer penalty:** tossups use −50 (quiz bowl's −5 on the 1000-point scale). Keep it, or make wrong answers penalty-free for casual play?
- **Strava auto-fill (future):** only if someone gets a Strava subscription and passes Strava's review for more than 10 athletes. It would then need explicit per-game consent, category names only, and no location data.

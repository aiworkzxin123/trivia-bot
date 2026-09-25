# Phase 0: Platform facts (checked 2026-09-25)

Checks the assumptions in PLAN.md §1 and §3 against primary sources: the official docs, legal pages, API responses and package registries. Where a claim was tested live, the command and result are given. "Verbatim" quotes are copied from the source page on the date above.

---

## 1. Instagram: can a third-party app list a user's followers?

**Answer: No.** No current Meta or Instagram API returns the accounts that follow a user.

- **Basic Display API** (the consumer API): shut down. Meta: *"Starting on December 4th, 2024, Instagram Basic Display API will no longer be available."* It was replaced by two professional-account APIs.
- **Instagram API with Instagram Login** and **Instagram API with Facebook Login** (the Graph API): professional accounts only. *"To use the APIs, your app users must have an Instagram professional account. An Instagram professional account can be for a business or creator."* Personal accounts can't connect at all.
- **IG User node fields:** `followers_count` (*"Total number of Instagram users following the user."*) and `follows_count` (*"Total number of Instagram users the user follows."*). Its edges (media, stories, insights, mentions, tags, business_discovery and others) include no edge that lists follower accounts.
- **Business Discovery** returns public fields of *another* Business or Creator account, such as `followers_count`, `media_count` and `media`. It gives counts only, never follower identities. It needs a Facebook User token with `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`.

**Confidence:** High.

**Sources:**
- https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/ (end-of-life date, replacement APIs)
- https://developers.facebook.com/docs/instagram-platform/overview (professional accounts only)
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user (fields and edges, count descriptions)
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery (Business Discovery fields and permissions)

**Impact on PLAN.md: confirm §1.1.** Keep the link/QR invite through the Web Share API. Most players have personal Instagram accounts, and those can't use Instagram Login at all, so the app should have no Instagram integration or login. Instagram is only a place where the link gets shared.

---

## 2. Strava API v3: followers, PKCE and rate limits

### 2a. Is there an endpoint that lists followers or friends?

**No.** The v3 reference lists these Athlete operations: `getLoggedInAthlete`, `getLoggedInAthleteZones`, `getStats` and `updateLoggedInAthlete`. None lists followers, friends or followings. Club membership is no longer a workaround either. The changelog entry for **September 1, 2026** says: *"Club Activities, Club Members, and Club Admins endpoints removed"*. Only `getClubById` and `getLoggedInAthleteClubs` remain. The Getting Started guide adds: *"The Strava API does not allow you to get data for all Strava public athletes, as you can see on our website."*

Checked on 2026-09-25 by listing every `id="api-…"` anchor in https://developers.strava.com/docs/reference/.

### 2b. PKCE or public clients?

**Not supported (not documented).** The token exchange `POST https://www.strava.com/oauth/token` requires `client_id`, `client_secret`, `code` and `grant_type=authorization_code`. Refreshing a token also requires `client_secret`. The docs never mention `code_challenge`, `code_verifier` or a secretless public-client flow. The deauthorization endpoint added in June 2026 also authenticates with *"HTTP Basic Auth with your application's client_id and client_secret"*. This is an absence of documentation, not an explicit "no", so confidence is medium-high. Either way, the secret has to stay on a server.

### 2c. Rate limits, athlete capacity and app registration

- Rate-limits page: *"The default overall rate limit allows 200 requests every 15 minutes, with up to 2,000 requests per day. The default "non-upload" rate limit allows 100 requests every 15 minutes, with up to 1,000 requests per day."*
- *"All newly created apps will have an athlete capacity of 1, aka "Single Player Mode"."* A self-service upgrade in the API Settings dashboard raises this to *"Athlete capacity of 10 / Read rate limits: 200 requests / 15min & 2,000 requests / day / Overall rate limits: 400 requests / 15min & 4,000 requests / day."* (Getting Started; the page's typo "Read read limits" is corrected here.)
- *"If you want to scale beyond 10 connected athletes you'll need to submit your app for review. Until your app has been reviewed, you won't be able to authenticate any additional athletes to your app."* Standard Tier apps can grow to 9,999 users after review (API Policy §3.3).
- **New: you need a paid subscription to build a Strava app at all.** Getting Started: *"A Strava subscription is a prerequisite for creating an app."* API Policy §3.3: *"Standard Tier Applications are subject to subscription requirements … including a requirement that the developer or specified end users maintain an active Strava subscription."* Strava's June 1, 2026 announcement says the subscription is required of the Standard Tier **developer**.
- **Base URL change:** *"The API base URL is changing from https://www.strava.com/api/v3 to https://api-v3.strava.com. The new base URL will be available starting January 4, 2027"* (changelog, June 1, 2026).
- The developer home page warns that Strava may revoke tokens for *"uses that enable virtual races or competitions"*. A trivia game uses only activity types to pick categories, so it is not a virtual race, but the app should never score or rank players on their Strava activity.

**Confidence:** High for 2a and 2c; medium-high for 2b.

**Sources:**
- https://developers.strava.com/docs/reference/ (endpoint list)
- https://developers.strava.com/docs/changelog/ (club endpoints removed, base URL change, deauthorize endpoint)
- https://developers.strava.com/docs/authentication/ (token exchange parameters, scopes, deauthorize)
- https://developers.strava.com/docs/rate-limits/ (rate limits, athlete capacity, review)
- https://developers.strava.com/docs/getting-started/ (subscription prerequisite, 10-athlete self-upgrade)
- https://developers.strava.com/ (virtual races warning)
- https://www.strava.com/legal/api_policy §3.3 (access tiers, subscription requirement)
- https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428 (official Strava announcement, June 1, 2026: the subscription applies to Standard Tier developers)

**Impact on PLAN.md: confirm §1.2, but new constraints need adding.**
- (a) Phase 0 "Register the Strava API app" now needs a **paid Strava subscription**.
- (b) The app starts in **Single Player Mode**, with only the developer's own account able to connect. It can self-upgrade to **10 connected athletes**. Beyond that it needs Strava's review, which has no guaranteed turnaround. For a friends-and-family game, 10 athletes may be the practical ceiling, so Strava has to stay optional (it already is).
- (c) Keep the token exchange in an Edge Function; PKCE won't remove the need for a server.
- (d) Put the API base URL in config so the January 2027 switch is a one-line change.
- (e) 90 days of activities is 1 to 3 list calls per player (`per_page` up to 200, with `after=`). That is fine under 100–200 requests per 15 minutes.

---

## 3. Strava API Agreement: showing one user's data to others

**Current documents:** "API Agreement (2026)" and "API Policy (2026)", both *"Effective Date: June 1, 2026"*. They replace the late-2024 agreement (*"Effective Date: November 11, 2024"*). Most of the operational rules have moved into the API Policy, which *"is incorporated by reference into, and forms part of"* the Agreement.

### Relevant clauses, verbatim

**Agreement (2026), highlights:**
> Strava Data provided by a specific user can only be displayed or disclosed in your Developer Application to that user. Strava Data related to other users, even if such data is publicly viewable on the Strava Platform, may not be displayed or disclosed.

> You must always respect Strava users and comply with their privacy choices. This includes not sharing a Strava user's data with other users, end users of your application, or third parties without explicit consent.

**Agreement §2.3(i):**
> "Strava Data" means all data you access or collect from the Strava API Materials, including without limitation Strava user personal and activity data and Strava segment and leaderboard data;

**API Policy (2026) §2.3, Display Limited to the Authenticated User:**
> Strava Data provided by a specific Strava user may be displayed or disclosed in your Developer Application only to that user. You may not display or disclose Strava Data related to other users, even if such data is publicly viewable on the Strava Platform.

**API Policy §5.4, No Aggregation, Analytics, or De-Identified Processing:**
> You may not process or disclose Strava Data—even publicly viewable Strava Data—including in an aggregated, de-identified, or anonymized manner, for the purposes of analytics, analyses, customer insight generation, or product or service improvements. You may not combine Strava Data with other customer data for these or any other purposes. The restrictions in this Section 5.4 apply to data derived from Strava Data and to output that incorporates or was generated using Strava Data.

**API Policy §5.13, No Circumvention of Authorization or Consent Flows:**
> You may not use the Strava API Materials in any way that would grant anyone other than you or the applicable Strava user the right to see data related to that user without the prior express consent of that user.

**API Policy §6.1, Scope of Data Access:**
> Unless your Developer Application has an athlete capacity of 9,999 or less, you may display or disclose to an end user only the specific Strava Data related to that end user. You may not display or disclose Strava Data related to other users, even if such data is publicly viewable on the Strava Platform.

**API Policy §6.2, Cache and Retention:**
> You may not retain Strava Data in your cache for longer than seven (7) days. […] Except for such limited caching, you may not store Strava Data, or provide or display Strava Data or any associated service, to any third party other than the Strava user using your Developer Application.

**API Policy §5.5 (extract):**
> You may not store Strava Data, or any data derived from Strava Data, in any Persistent Index.

**API Policy §5.3, No AI/ML** (applies if the app ever uses an LLM, for example to generate category ideas):
> You may not use the Strava API Materials or Strava Data, directly or indirectly, in connection with the development, training, evaluation, or operation of any AI Application. This prohibition extends to: Any data derived from, aggregated from, anonymized from, or generated using Strava Data … ingestion into a context window or working memory …

**API Policy §7.4, Deletion Obligation (extract):**
> Upon (a) a Strava user's request, (b) a Strava user's revocation of your Developer Application's authorization … you must promptly and permanently delete … all Strava Data and all Personal Data derived from Strava Data relating to the requesting or revoking user. … within thirty (30) days

**API Policy §2.1** requires consent that discloses *"(i) The types of data that will be collected; (ii) The methods by which the data will be collected; (iii) How the user may withdraw consent; (iv) How the user may request deletion of the user's data; and (v) If a deletion request is made, that the deletion was successfully completed."*

**The late-2024 version (Nov 11, 2024), for comparison:**
> Unless your Developer Application is a "Community Application," You may only display or disclose to an end user the specific Strava Data related to that user. […] A "Community Application" is defined as a Developer Application created with the primary purpose of permitting athletes to organize and collaborate in group activities and are no larger than 9,999 registered users. Classification of a Developer Application as a Community Application shall be performed by Strava in its sole discretion.

### Assessment

**Is "4 of 5 players cycle → suggest Tour de France trivia" permitted?** It is plausible but not clearly permitted. The main points:

1. **It is still "Strava Data".** §5.4 says the restrictions *"apply to data derived from Strava Data and to output that incorporates or was generated using Strava Data"*. The Agreement never says derived or aggregated output falls outside "Strava Data", so a group suggestion can't be treated as outside the rules.
2. **§5.4 (aggregation) is aimed at purpose.** It bans aggregation *"for the purposes of analytics, analyses, customer insight generation, or product or service improvements."* A suggestion that is part of the feature, shown live to the people whose data it came from, is not analytics or product improvement. This clause is probably not the blocker, provided the app never logs or analyzes the affinity data beyond the live game.
3. **§2.3 and §6.1 (display only to that user) are the real constraint.** A count like "4 of 5 players ride" in a 5-person lobby shows other players something about each person. With small groups, anyone can often work out who rides. Read strictly, that is disclosing one user's derived data to other users.
4. **Consent is the documented way out.** The highlights (*"not sharing … with other users … without explicit consent"*) and §5.13 (*"without the prior express consent of that user"*) both imply that sharing with explicit, prior consent is acceptable. §2.3 of the Policy has no consent exception, so this is an inference, not an explicit permission.
5. **§6.1 is ambiguous.** Read literally, it lifts the display-to-self restriction for apps with capacity ≤ 9,999. That looks like a leftover from the 2024 "Community Application" exception, and it contradicts §2.3 and the highlights. Don't rely on it. If it matters, email developers@strava.com; §2.2 of the Agreement invites this: *"If you are unsure if a certain use … is permitted … please contact us."*

**The safest design, in order of importance:**
- **Explicit, per-game opt-in** at connect time and in the lobby, worded to meet §2.1 and §5.13. For example: "Share which *types* of sport you do (not your activities) with players in this game, as anonymous category suggestions. You can withdraw this at any time."
- **No names and no per-person attribution.** Show only the category, such as "Suggested: Cycling & Geography". Drop the counts ("4 of 5") or use vague wording ("popular in this group").
- **k-anonymity threshold:** suggest a category only when at least 3 consenting players (or ≥ 50% of the lobby, whichever is larger) share it. Never show a suggestion that traces back to one person, including in a 2-player game.
- **Keep it short-lived:** don't store activities. Keep counts per player only in memory or for the life of the game, and delete `category_affinity` rows when the game ends. §6.2 caps any cache at 7 days, and §5.5 forbids a "Persistent Index" of derived data.
- **Minimal scope:** `activity:read` is enough. Don't use locations. Drop PLAN §8.6 (geography suggestions from activity locations): §5.7 forbids using the API *"to aggregate, cache, or store geographic location information"*.
- **No LLM** anywhere in the Strava path (§5.3).
- **Deletion:** honour disconnect and revocation within 30 days, confirm deletion in writing (§2.5, §7.4), and handle the deauthorization webhook.
- **Brand:** follow the Strava Brand Guidelines (a "Connect with Strava" button). Don't use "Strava" in the app's name (§4.1, §4.3).

**Confidence:** High on what the text says; medium on how the aggregated-suggestion feature would be judged. Strava reserves sole discretion (Policy §5).

**Sources:**
- https://www.strava.com/legal/api (Agreement 2026: highlights, §2.2, §2.3)
- https://www.strava.com/legal/api_policy (Policy 2026: §2.1, §2.3, §2.5, §3.3, §4, §5.3–5.5, §5.7, §5.13, §6.1, §6.2, §7.4)
- https://web.archive.org/web/20250115000000/https://www.strava.com/legal/api (Nov 11, 2024 version, Community Application clause)

**Impact on PLAN.md: change needed.** §1.3's direction (server-side, derived suggestions only) is right but not enough. Update §1.3 to cite the **June 1, 2026** Agreement and Policy. Add explicit consent, drop the "(4 of 5 players ride)" wording in §8.5, add a minimum-group threshold, make `category_affinity` short-lived, drop §8.6 (locations), and don't store raw activities.

---

## 4. QBReader

### API (tested live 2026-09-25)

The base URL is `https://www.qbreader.org/api`. GET parameters go in the query string. The docs say: *"The API is rate-limited to 20 requests per second."* Live response headers confirm this: `Ratelimit-Limit: 20`, `Ratelimit-Reset: 1`.

**`GET /api/random-tossup`**
- Parameters: `difficulties` (number, list or comma string), `categories`, `subcategories`, `alternateSubcategories` (comma-separated; capitalize each word), `number` (default 1), `minYear`, `maxYear`, `powermarkOnly`, `standardOnly`.
- Returns `{ tossups: Tossup[] }`. Each Tossup has `_id`, `question` (HTML; the power mark is `(*)` and the power region is wrapped in `<b>…</b>`), `question_sanitized`, `answer` (HTML answerline with `<b><u>` marking required parts), `answer_sanitized`, `category`, `subcategory`, `difficulty` (number), `set {_id, name, year, standard}`, `packet {_id, name, number}`, `number` and `updatedAt`.
- Live sample: a 2023 Penn Bowl biology tossup whose answer was `"<b><u>blood</u></b> [or <b><u>hematophagy</u></b>; …]"`.

**`GET /api/query`**
- Parameters: `q`, `questionType` (tossup/bonus/all), `searchType` (question/answer/all), `caseSensitive`, `exactPhrase`, `ignoreWordOrder`, `regex`, `randomize`, `setName`, `difficulties`, `categories`, `subcategories`, `alternateSubcategories`, `maxReturnLength` (default 25), `tossupPagination` and more.
- Returns `{ tossups: {count, questionArray}, bonuses: {count, questionArray}, queryString }`.

**`GET /api/check-answer?answerline=…&givenAnswer=…`**
- Returns `{ directive: "accept"|"reject"|"prompt", directedPrompt?: string }`. The docs say to send the answerline *"Preferably including the HTML tags `<b>` and `<u>`"*.
- Live tests with answerline `<b><u>Leonardo</u> da Vinci</b> [accept Leonardo; prompt on da Vinci]`:
  - "leonardo" → accept
  - "Leonardo da Vinci" → accept
  - "da vinci" → prompt
  - "michelangelo" → reject
  - "leonardo da vinchi" (typo) → accept
- A directed prompt (`prompt on <u>fluid</u> by asking "what specific fluid?"`) returned `{"directive":"prompt","directedPrompt":"what specific fluid?"}`.

Other endpoints: `/random-bonus`, `/packet`, `/num-packets`, `/set-list`, `/bonus`, `/tossup`, `/frequency-list`, `/question-stats/*`, `/random-name`, `/multiplayer/room-list` and POST `/report-question`.

**Categories** (from `shared/categories.js` in the source): Literature, History, Science, Fine Arts, Religion, Mythology, Philosophy, Social Science, Current Events, Geography, Other Academic, and Pop Culture (subcategories Movies, Music, **Sports**, Television, Video Games, Other Pop Culture). Sports is a Pop Culture subcategory, and there is no cycling-level detail. An answer search for "tour de france" returned 0 tossups.

### CORS (tested)

```
curl -sI -H "Origin: https://example.github.io" "https://www.qbreader.org/api/random-tossup?number=1"
→ HTTP/1.1 200 OK, Access-Control-Allow-Origin: *
OPTIONS /api/check-answer (preflight) → 204, Access-Control-Allow-Origin: *, Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

Browser calls work. For this app, though, the question must be fetched **server-side** anyway: a browser fetch would expose the answer to players. The browser can't call check-answer either, because it would need the answerline.

### Terms and licensing

- QBReader Terms of Service (last updated July 4, 2025), §5: *"The Service and its original content, features, and functionality are released under the MIT License"*. The website repo on GitHub is also MIT.
- **The questions are not QBReader's original content.** The About page says: *"Packets are collected from quizbowlpackets.com and parsed into JSON files."* The questions are written by third-party tournament editors (ACF, PACE and others) who keep their copyright. No page grants a licence for the question text. quizbowlpackets.com was behind a Cloudflare challenge and couldn't be checked.
- There is no ToS clause on API use, commercial use or redistribution. A non-commercial hobby app that fetches questions live with credit is the norm in the quiz bowl community, but it is not an explicit permission.

### `qb-answer-checker` (npm)

- Latest version **1.1.9** (published 2026-02-22). There are 17 releases since Dec 2023; the last commit was on 2026-02-22 and the repo isn't archived. It is lightly maintained: 4 stars and 4 open issues.
- **License:** `"license": "ISC"` in package.json. The GitHub repo has **no LICENSE file** (the GitHub API reports `license: null`), so only package.json states a licence.
- **Module:** ESM (`"type": "module"`, main `src/check-answer.js`) with TypeScript types. It also ships a browser bundle at `dist/main.mjs`. Dependencies: `damerau-levenshtein-js`, `number-to-words`, `roman-numerals`, `stemmer`.
- **API:**
  ```ts
  export type CheckDirective = 'accept' | 'prompt' | 'reject';
  export interface CheckResult { directive: CheckDirective; directedPrompt?: string; }
  declare function checkAnswer(answerline: string, givenAnswer: string, strictness?: number, verbose?: boolean): CheckResult;
  export default checkAnswer; export { checkAnswer };
  ```
- **Input format:** `<main section> [<sub-section>] …`.
  - Sections are made of clauses separated by `;`. Each clause is `<directive>? (on)? <answer> (or <answer>)* (by asking|with <directed prompt>)?`.
  - Directives: `accept`, `prompt`, `reject`, `anti-prompt`/`antiprompt`.
  - Special directives: `accept either`/`accept any` and `prompt on partial`.
  - The `<b><u>` HTML marks the required parts. Passing the raw HTML `answer` field works best.

**Confidence:** High (API, CORS, rate limit and package facts were tested or read from source). Medium on question licensing, because no source states it.

**Sources:**
- https://www.qbreader.org/tools/api-docs/ (base URL, rate limit)
- https://www.qbreader.org/tools/api-docs/random-tossup, https://www.qbreader.org/tools/api-docs/query, https://www.qbreader.org/tools/api-docs/check-answer, https://www.qbreader.org/tools/api-docs/schemas (parameters and response shapes)
- https://www.qbreader.org/about/terms-of-service (ToS §5, MIT)
- https://www.qbreader.org/about/ (packets come from quizbowlpackets.com)
- https://github.com/qbreader/website/blob/main/shared/categories.js (category list)
- https://registry.npmjs.org/qb-answer-checker (versions, ISC licence, dependencies)
- https://github.com/qbreader/qb-answer-checker (README, `.d.ts`, commits)
- Live curl tests above

**Impact on PLAN.md: confirm, with changes.**
- (a) CORS is open, but PLAN's fallback ("call it through an Edge Function") should become the **default**. Answer secrecy requires the server to fetch the question and keep the answerline anyway.
- (b) Use `qb-answer-checker` **inside the Edge Function** (Deno can import it with `npm:qb-answer-checker`) rather than calling `/api/check-answer`. That avoids a network hop per answer and the 20 requests/second limit. It already covers exact, fuzzy, stemming, number-word, prompt and directed-prompt matching, so PLAN §5 steps 1–5 largely **reuse it** instead of being built from scratch. Only apply our own normalization or surname rules as a fallback for Open Trivia DB answers, which have no answerline.
- (c) Read the power mark from `(*)` in the `question` HTML.
- (d) QBReader categories are academic (see list), so the Strava mapping (§8.3) must target these names: Pop Culture › Sports, Geography, Science › Biology. Topics like "Tour de France" or "marathons" aren't categories and have almost no questions.
- (e) QBReader tossups are long paragraphs, so they suit tossup mode, not the short classic pub-quiz format. Use `standardOnly=true` and a `difficulties` filter, for example 1–5 for casual play.
- (f) Credit QBReader and the original set names (`set.name`) on the attribution page. Since the question licence is unclear, fetch live instead of bulk-copying QBReader data into the repo.

---

## 5. Open Trivia DB

- **License:** *"All data provided by the API is available under the Creative Commons Attribution-ShareAlike 4.0 International License."*
- **Rate limit:** response code 5: *"Too many requests have occurred. Each IP can only access the API once every 5 seconds."*
- **Session tokens:**
  - Request one with `https://opentdb.com/api_token.php?command=request`. Reset with `…?command=reset&token=…`.
  - With a token, the API *"will never give you the same question twice"*.
  - Code 4 (*"Token Empty"*) means the token has used up every question. *"Session Tokens will be deleted after 6 hours of inactivity."*
- **Categories:** `https://opentdb.com/api_category.php` returns `{trivia_categories:[{id,name}]}` with 24 categories (ids 9–32). Per-category counts are at `api_count.php?category=ID`, and global counts at `api_count_global.php`.
- **Limits:** *"Only 1 Category can be requested per API Call"* and *"A Maximum of 50 Questions can be retrieved per call."* Encodings: default HTML entities, `urlLegacy`, `url3986` and `base64`.
- **CORS:** `Access-Control-Allow-Origin: *` (tested).
- **Size:** `api_count_global.php` returned **5,298 verified questions** (21,622 total, of which 10,916 are pending and 5,425 rejected). The API serves only the verified ones.

### Free-text suitability (the whole verified set was downloaded with a session token and classified)

All 5,298 verified questions were fetched in 107 calls, about 6.5 s apart.

| Filter | Questions | Share |
|---|---|---|
| True/False (`type=boolean`) | 788 | 14.9% |
| Multiple choice, "Which of these / of the following / one of these…" | 588 | 11.1% |
| Multiple choice with negation (NOT / isn't…); pattern is crude and includes a few false positives | 90 | 1.7% |
| Multiple choice with an answer longer than 4 words | 190 | 3.6% |
| **Left after the automatic filters** | **3,671** | **69.3%** |
| (Info) answers that are purely numeric, so they need number normalization | 472 | 8.9% |

Difficulty mix of the full set: easy 1,770, medium 2,424, hard 1,104.

The filtered pool is heavily skewed. The top categories after filtering are Video Games 778, Music 346, History 316, General Knowledge 313, Geography 257, Film 227, Science & Nature 203, and **Sports only 139**. Mythology has 48, Art 42 and Musicals 28. Examples that survive the filters and work as free text: "What is Russia's second-largest city? → Saint Petersburg" and "What was the name of the planet in "Aliens"? → LV-426".

Some multiple-choice items still only make sense with choices, for example comparisons like "Which of the following games has the largest map size?". Expect a manual blocklist to remove another few percent, leaving a realistic **~3,300–3,500 usable questions (about 65%)**.

**Confidence:** High (licence, rate limit, tokens and endpoints are from the official page; counts are measured).

**Sources:**
- https://opentdb.com/api_config.php (licence, tokens, response codes, limits, encodings, helper endpoints)
- https://opentdb.com/api_category.php and https://opentdb.com/api_count_global.php (live)
- Full-set download on 2026-09-25 with `api.php?amount=50&encode=url3986&token=…`

**Impact on PLAN.md: confirm, with a change.** The licence, rate limit and filters are all confirmed. The pool that survives the filter is small (see numbers above), so a nightly rebuild is overkill. Build the JSON once, then refresh it weekly or monthly, using a session token so every verified question is fetched once. Keep the CC BY-SA credit and note that a derived JSON file must also be CC BY-SA. Classic mode depends heavily on this small pool, so plan for repeats or add a short-question source.

---

## 6. Supabase free tier

| Item | Free plan | Source |
|---|---|---|
| Realtime concurrent connections | 200 | pricing; realtime limits |
| Realtime messages | 2 million per month; 100 messages per second | pricing; realtime limits |
| Realtime channel joins per second / channels per connection | 100 / 100 | realtime limits |
| Presence messages per second / keys per object | 20 / 10 | realtime limits |
| Broadcast payload | 256 KB | realtime limits |
| Edge Function invocations | 500,000 per month | pricing |
| Edge Function runtime | 256 MB memory, 2 s CPU time, 150 s wall clock and idle timeout, 100 functions per project | functions limits |
| Monthly active users | 50,000 | pricing |
| Database | 500 MB per project; 2 active free projects | pricing |
| Anonymous sign-ins | Supported: `supabase.auth.signInAnonymously()`. Users get the `authenticated` role; tell them apart in RLS with the `is_anonymous` JWT claim. Rate limit: 30 requests per hour per IP (configurable). CAPTCHA or Turnstile is recommended | auth-anonymous |
| Pausing | *"paused after 1 week of inactivity"*. Inactive means not receiving *"sufficient user database activity over the past week"*. *"Typically a few user requests to the database each day over the previous week is enough"*. A paused project can be restored for up to 1 year | pricing; free-project-pausing |
| Going over quota | You are notified, then get a one-time grace period, then the Fair Use Policy applies: the project may be paused or made read-only, or API requests return 402 | billing-faq |

**Confidence:** High.

**Sources:**
- https://supabase.com/pricing
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/platform/billing-faq

**Impact on PLAN.md: confirm §2**, with notes:
- (a) Pausing after a week of no use will hit a hobby game. Add a scheduled GitHub Action that makes a daily lightweight DB request, or accept a manual restore.
- (b) The 30-per-hour-per-IP anonymous sign-in limit can bite when a whole party joins from one venue Wi-Fi. Raise it in the dashboard and add Turnstile.
- (c) The 2 s CPU limit is fine for `qb-answer-checker`, but don't do heavy work per answer.
- (d) Budget Realtime messages: 10 players × ~20 messages per question × 20 questions ≈ 4k messages per game, so 2M per month is roughly 500 games. That is fine.

---

## Changes recommended to PLAN.md

1. **§1 intro:** replace "These have not been checked…" with a link to this file. All four limits are confirmed, and the Strava one is stricter than written.
2. **§1.3:** cite the **Strava API Agreement and API Policy effective June 1, 2026**, not the "2024 terms". Add explicit per-game opt-in consent (Policy §2.1, §5.13), no per-person attribution, a minimum group-size threshold, and short-lived affinity data (≤ game lifetime, never more than 7 days, per §6.2 and §5.5).
3. **§8.5:** drop "(4 of 5 players ride)" counts. Show only the category, and only when ≥ 3 consenting players share it.
4. **§8.6:** remove the location-based geography suggestions. Policy §5.7 forbids using the API to aggregate or store geographic location information.
5. **§8 and §7:** don't store raw activities. Delete `category_affinity` rows at game end. Handle deauthorization webhooks and revocations, and confirm deletion to the user (§2.5, §7.4). Keep Strava data out of any LLM (§5.3).
6. **§8.3:** remap activity types to QBReader's real categories (Pop Culture › Sports, Geography, Science › Biology or Earth Science, Mythology…) and OTDB's (Sports 21, Geography 22, Science & Nature 17). Treat "Tour de France" and "marathons" as flavour labels, not categories you can query.
7. **§10 Phase 0 and §13:** registering a Strava app needs a **paid Strava subscription**. The app starts in Single Player Mode, self-upgrades to **10 athletes**, and needs Strava's review beyond that (no guaranteed turnaround). Add this as an open decision or risk. Consider emailing developers@strava.com to confirm the aggregated-suggestion feature.
8. **§2 and §8:** make the Strava API base URL configurable (it moves to `https://api-v3.strava.com` from January 4, 2027).
9. **§3 (QBReader):** CORS is open (`Access-Control-Allow-Origin: *`), but always fetch server-side for answer secrecy. Use `qb-answer-checker` (ISC; ESM; `checkAnswer(answerline, givenAnswer)`, which returns `{directive, directedPrompt?}`) inside the Edge Function instead of the HTTP check-answer API. The rate limit is 20 requests per second. The question text is third-party copyrighted with no explicit licence, so fetch live with credit and don't bulk-copy it into the repo.
10. **§5:** steps 1–5 mostly come from `qb-answer-checker` for QBReader questions. Build the custom normalizer, fuzzy and surname rules only for Open Trivia DB answers, or as a wrapper, and keep the host override.
11. **§4 and §3:** QBReader tossups are long paragraphs, so use them for tossup mode (power mark `(*)`, with `standardOnly=true` and a difficulty filter). Classic mode relies on the small filtered Open Trivia DB pool (see §5 numbers).
12. **§3 (Open Trivia DB):** replace "nightly GitHub Action" with a one-off or weekly build using a session token. The derived JSON is CC BY-SA 4.0 and must be credited.
13. **§2 and §10 Phase 6:** add a keep-alive cron against Supabase's 7-day inactivity pause, raise the anonymous sign-in rate limit (30 per hour per IP by default), and add Turnstile.
14. **§1.1:** no change. Instagram has no follower API, and personal accounts can't use Instagram's APIs at all, so use share links only.

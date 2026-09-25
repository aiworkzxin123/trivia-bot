/**
 * Takes screenshots of every screen on the live site, as a desktop host and a
 * phone guest playing through solo and multiplayer games.
 *
 * Run with: npm run screenshots   (uses the installed Microsoft Edge)
 * Saves to screenshot/. Set SITE to point at another deployment, e.g. http://localhost:5173/
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright-core'

const SITE = process.env.SITE ?? 'https://aiworkzxin123.github.io/trivia-bot/'
const OUT = fileURLToPath(new URL('../screenshot/', import.meta.url))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let n = 0
async function shot(page: Page, name: string) {
  n++
  const file = `${String(n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: OUT + file, fullPage: true })
  console.log(`  saved screenshot/${file}`)
}

async function desktop(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })).newPage()
}

async function phone(browser: Browser, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme,
  })
  return context.newPage()
}

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })

async function solo(browser: Browser) {
  console.log('Solo')
  const page = await desktop(browser)
  await page.goto(SITE)
  await page.getByText('Play solo').waitFor()
  await shot(page, 'home-desktop')

  const mobile = await phone(browser)
  await mobile.goto(SITE)
  await mobile.getByText('Play solo').waitFor()
  await shot(mobile, 'home-phone')
  const dark = await phone(browser, 'dark')
  await dark.goto(SITE)
  await dark.getByText('Play solo').waitFor()
  await shot(dark, 'home-phone-dark')

  await page.goto(`${SITE}#/solo`)
  await button(page, 'Start game').waitFor()
  await button(page, /^Geography/).click()
  await button(page, /^History/).click()
  await shot(page, 'solo-setup')

  await button(page, 'Start game').click()
  await page.locator('.question').waitFor()
  await sleep(2500)
  await shot(page, 'solo-question')
  await page.getByPlaceholder('Type your answer').fill('definitely wrong')
  await page.keyboard.press('Enter')
  await page.locator('.feedback.wrong').waitFor()
  await shot(page, 'solo-wrong-answer')
  await page.getByPlaceholder('Type your answer').fill('still wrong')
  await page.keyboard.press('Enter')
  await page.locator('.reveal').waitFor()
  await shot(page, 'solo-reveal')

  // Tossup mode on a phone.
  await mobile.goto(`${SITE}#/solo`)
  await button(mobile, 'Quiz bowl tossups').click()
  await shot(mobile, 'solo-tossup-setup-phone')
  await button(mobile, 'Start game').click()
  await mobile.locator('.tossup-text').waitFor({ timeout: 20_000 })
  await sleep(4000)
  await shot(mobile, 'solo-tossup-reading-phone')

  await page.goto(`${SITE}#/about`)
  await page.getByText('Where the questions come from').waitFor()
  await shot(page, 'about')
}

async function multiplayer(browser: Browser) {
  console.log('Multiplayer')
  const host = await desktop(browser)
  await host.goto(`${SITE}#/host`)
  await host.getByLabel('Your name').fill('Sam')
  for (const i of ['Cycling', 'Running', 'Music']) await button(host, i).click()
  await shot(host, 'host-form')
  await button(host, 'Create game').click()
  await host.locator('.code').waitFor({ timeout: 20_000 })
  const code = (await host.locator('.code').innerText()).trim()
  console.log(`  game code ${code}`)

  const guest = await phone(browser)
  await guest.goto(`${SITE}#/join/${code}`)
  await guest.getByLabel('Your name').fill('Alex')
  for (const i of ['Cycling', 'Running', 'Travel']) await button(guest, i).click()
  await shot(guest, 'join-form-phone')
  await button(guest, 'Join game').click()
  await guest.getByText('Waiting for the host to start').waitFor({ timeout: 20_000 })

  // Suggestions appear for the host once both have joined.
  await host.getByText('Suggested for this group').waitFor({ timeout: 15_000 })
  await button(host, '5').click()
  await sleep(1500)
  await shot(host, 'lobby-host')
  await sleep(1000)
  await shot(guest, 'lobby-guest-phone')

  await button(host, 'Start game').click()
  await guest.locator('.countdown').waitFor({ timeout: 20_000 })
  await shot(guest, 'countdown-phone')
  await guest.locator('.question').waitFor({ timeout: 20_000 })
  await host.locator('.question').waitFor({ timeout: 20_000 })
  await sleep(1500)
  await shot(host, 'question-host')

  await guest.getByPlaceholder('Type your answer').fill('Mont Blanc')
  await guest.keyboard.press('Enter')
  await guest.locator('.feedback.wrong, .waiting').first().waitFor()
  await shot(guest, 'question-guest-phone-after-wrong')

  for (const answer of ['my first guess', 'my second guess']) {
    await host.getByPlaceholder('Type your answer').fill(answer)
    await host.keyboard.press('Enter')
    await sleep(800)
  }
  await guest.getByPlaceholder('Type your answer').fill('another guess')
  await guest.keyboard.press('Enter')

  await host.getByText('Leaderboard').waitFor({ timeout: 20_000 })
  await sleep(1000)
  await shot(host, 'reveal-host-with-accept')
  await guest.getByText('Leaderboard').waitFor({ timeout: 20_000 })
  await shot(guest, 'reveal-guest-phone')

  // Accept one of the guest's answers, then play out the rest quickly.
  await host.getByRole('button', { name: 'Accept' }).first().click()
  await sleep(2000)
  await shot(host, 'reveal-after-accept')
  for (let i = 1; i < 5; i++) {
    await button(host, 'Next question').click()
    for (const p of [host, guest]) {
      await p.getByPlaceholder('Type your answer').waitFor({ timeout: 20_000 })
    }
    for (const p of [host, guest]) {
      for (const answer of ['pass one', 'pass two']) {
        await p.getByPlaceholder('Type your answer').fill(answer)
        await p.keyboard.press('Enter')
        await sleep(700)
      }
    }
    await host.getByText('Leaderboard').waitFor({ timeout: 20_000 })
  }
  await button(host, 'See final results').click()
  await host.getByText('Game over').waitFor({ timeout: 20_000 })
  await shot(host, 'final-results-host')
  await guest.getByText('Game over').waitFor({ timeout: 20_000 })
  await shot(guest, 'final-results-guest-phone')
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  try {
    await solo(browser)
    await multiplayer(browser)
  } finally {
    await browser.close()
  }
  console.log(`Done: ${n} screenshots`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

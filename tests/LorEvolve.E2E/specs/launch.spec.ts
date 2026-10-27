import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, unique } from './support/trash'

/**
 * 043.5: the launch layer. An installed LorEvolve opens on black with its logo and the opening - a book, a world, a game
 * and a screen drawn around it - then reveals the app that started underneath; a browser tab sees it only on its first
 * visit to the home page, a reload or a navigation in the same window never replays it, a tap or key skips it, and
 * reduced motion gets a fade rather than movement.
 *
 * Playwright cannot install the app, so "installed" is the one thing the page reads to decide:
 * `matchMedia('(display-mode: standalone)')`, answered as an installed window would before anything else runs.
 */

/** A browser driven by a person, not by automation: the home page's opening is skipped under `navigator.webdriver`. */
async function asPerson(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }),
  )
}

async function asInstalled(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const list = original(query)
      if (query.includes('display-mode: standalone')) {
        Object.defineProperty(list, 'matches', { value: true })
      }
      return list
    }
  })
}

/** The launch logo's requests, so a test can say a browser tab never fetches it. */
function watchLogo(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/launch-logo.webp')) requests.push(request.url())
  })
  return requests
}

test.describe('the launch layer', () => {
  test('an installed launch opens on black with the logo, then reveals the portal and leaves nothing behind', async ({
    page,
  }) => {
    await asInstalled(page)
    const logo = watchLogo(page)
    await page.goto('/explore')

    // Black, from the first paint, with the browser chrome black too while it shows.
    const layer = page.getByTestId('launch')
    await expect(page.locator('html')).toHaveAttribute('data-launch', /on|leaving/)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.getElementById('launch')!).backgroundColor,
      ),
    ).toBe('rgb(0, 0, 0)')
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.launch__logo')!).animationName,
      ),
    ).toBe('launch-logo')
    expect(logo.length).toBeGreaterThan(0)

    // Then it lifts by itself, and what LorEvolve opens on is there and usable.
    await expect(layer).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute(
      'content',
      /#f6f2ea|#151617/,
    )
    await page.getByRole('link', { name: 'Log in' }).first().click()
    await page.waitForURL(/\/login/)

    // Moving around the app never brings it back.
    await expect(page.getByLabel('Username or email')).toBeVisible()
    await expect(layer).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')

    // Nor does reloading the same window: only a new launch shows it.
    await page.reload()
    await expect(page.getByLabel('Username or email')).toBeVisible()
    await expect(layer).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
  })

  test('a signed-in launch reveals the workspace once the session is known, never its pending plate', async ({
    context,
  }) => {
    const setup = await context.newPage()
    const username = unique('launcher')
    await setup.goto('/register')
    await setup.getByLabel('Username').fill(username)
    await setup.getByLabel('Email').fill(`${username}@example.test`)
    await setup.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await setup.getByLabel('Confirm password').fill(PASSWORD)
    await setup.getByRole('button', { name: 'Create account' }).click()
    await setup.waitForURL('/app')

    // A new window of the installed app, signed in.
    const page = await context.newPage()
    await asInstalled(page)
    await page.goto('/app')

    // Whenever the layer starts to leave, the session probe's plate is already gone.
    await expect(page.locator('html')).toHaveAttribute('data-launch', /on|leaving/)
    await page.waitForFunction(() => document.documentElement.dataset.launch !== 'on', null, {
      timeout: 10_000,
    })
    expect(await page.locator('.session-pending').count()).toBe(0)
    await expect(page.getByTestId('launch')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByTestId('new-universe')).toBeVisible()
  })

  test('a browser tab starts as it always has: no layer, no logo fetched', async ({ page }) => {
    const logo = watchLogo(page)
    await page.goto('/explore')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByTestId('launch')).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute(
      'content',
      /#f6f2ea|#151617/,
    )
    expect(logo).toEqual([])
  })

  test("a browser's first visit to the home page plays the opening, and once only", async ({
    page,
  }) => {
    await asPerson(page)
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-launch', /on|leaving/)
    await expect(page.getByTestId('launch-form')).toHaveCount(4)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.launch__form--book')!).animationName,
      ),
    ).toContain('launch-form')

    // It plays out, wipes away and leaves the home page usable.
    await expect(page.getByTestId('launch')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
    await expect(page.getByRole('main')).toBeVisible()

    // The same window never sees it again.
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByTestId('launch')).toHaveCount(0)
  })

  test('a key skips the opening at once', async ({ page }) => {
    await asPerson(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-launch', 'on')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('launch')).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute(
      'content',
      /#f6f2ea|#151617/,
    )
  })

  test('with reduced motion the logo fades in place and the layer fades out, with nothing moving', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await asInstalled(page)
    await page.goto('/explore')

    await expect(page.locator('html')).toHaveAttribute('data-launch', /on|leaving/)
    const logo = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.launch__logo')!)
      return { animation: style.animationName, duration: style.animationDuration }
    })
    expect(logo).toEqual({ animation: 'launch-fade-in', duration: '0.16s' })

    await page.waitForFunction(() => document.documentElement.dataset.launch !== 'on', null, {
      timeout: 10_000,
    })
    const leaving = await page.evaluate(() => {
      const layer = document.getElementById('launch')
      return layer ? getComputedStyle(layer).animationName : 'gone'
    })
    expect(['launch-fade-out', 'gone']).toContain(leaving)
    await expect(page.getByTestId('launch')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByRole('main')).toBeVisible()
  })
})

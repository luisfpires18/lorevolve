import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Lore's category selection in an installed Lorex, as far as a browser can stand in for one (issue #58).
 *
 * SIMULATION, SAID PLAINLY. Playwright cannot install a web app. What is simulated here is everything the page itself
 * can read about being installed, answered as an installed window answers it before any script runs:
 *
 *   - `matchMedia('(display-mode: standalone)')` matches, so the launch layer draws (043.5) and the app takes the
 *     installed path everywhere it asks;
 *   - `navigator.standalone` is true, as on an iOS Home Screen web app;
 *   - the viewport is a phone's, with touch, and the safe-area insets of a notched phone are applied through the
 *     DevTools protocol where this Chromium supports it, so `env(safe-area-inset-*)` resolves to real sizes.
 *
 * It does not simulate WebKit, an OS's own `<select>` picker, a platform's gesture navigation, a separate cookie jar,
 * or how an OS resumes a suspended app. Those are the manual checks in `docs/testing/pwa-checklist.md`, which a green
 * run here never replaces.
 *
 * What it does prove: with the installed path taken and the insets in place, every Lore category control can be
 * reached, opened, chosen from and saved - the Category menu on the Lore browser, the Type picker on an entry's form -
 * nothing sits over them (the launch layer is gone, the sticky bar keeps clear), nothing clips the menu, and the
 * choice persists through a reload and a fresh window.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** A phone in portrait, with touch: the coarse-pointer rules apply, as on a device. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

/** What the page reads to decide it is installed, answered before anything else runs. */
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
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
  })
}

/**
 * A notched phone's safe areas, where this Chromium's DevTools protocol can set them. Asked for before any navigation;
 * whether `env(safe-area-inset-top)` then resolves to anything is measured on the page, not assumed from the call
 * succeeding, and the test says which it got rather than passing silently.
 */
async function withSafeAreas(page: Page) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 47, left: 0, bottom: 34, right: 0 },
    })
  } catch {
    /* Not in this Chromium: the page then sees no insets, which the probe below reports. */
  } finally {
    await session.detach().catch(() => {})
  }
}

/** What `env(safe-area-inset-top)` resolves to on the open page, in CSS pixels. */
async function safeAreaTop(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);visibility:hidden'
    document.body.append(probe)
    const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0
    probe.remove()
    return inset
  })
}

async function signUp(page: Page) {
  const username = unique('installed')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page) {
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Pocket World '), description: null, accentColor: null },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

/** The launch layer has lifted and left nothing behind: the first thing an installed window must get right. */
async function expectLaunched(page: Page) {
  await expect(page.getByTestId('launch')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('html')).not.toHaveAttribute('data-launch')
}

/** The element under a point is the control or inside it: nothing fixed, sticky or stacked covers it. */
async function expectUncovered(page: Page, testId: string) {
  const covered = await page.evaluate((id) => {
    const control = document.querySelector(`[data-testid="${id}"]`)
    if (!control) return `no ${id}`
    const r = control.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return hit && control.contains(hit) ? null : `${id} is under ${hit?.tagName}.${hit?.className}`
  }, testId)
  expect(covered, covered ?? '').toBeNull()
}

/** The whole box is inside the viewport, under the sticky bar and above the bottom edge. */
async function expectOnScreen(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!
  const viewport = page.viewportSize()!
  const bar = (await page.locator('.rail').boundingBox())!
  expect(box.y, `${testId} is under the sticky bar`).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
  expect(box.y + box.height, `${testId} runs off the bottom`).toBeLessThanOrEqual(
    viewport.height + 1,
  )
  expect(box.x, `${testId} runs off the left`).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width, `${testId} runs off the right`).toBeLessThanOrEqual(viewport.width + 1)
}

test.describe('an installed Lorex on a phone (simulated)', () => {
  test('choosing a Lore category loads and shows that category’s entities', async ({ page }) => {
    await asInstalled(page)
    await withSafeAreas(page)
    await signUp(page)
    const universeId = await newUniverse(page)
    const types = (await (
      await page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const character = types.find((type) => type.name === 'Character')!
    const location = types.find((type) => type.name === 'Location')!

    for (const [typeId, name] of [
      [character.id, 'PWA Character visible'],
      [location.id, 'PWA Location visible'],
    ]) {
      const response = await page.request.post(`/api/universes/${universeId}/entities`, {
        data: {
          entityTypeId: typeId,
          name,
          summary: null,
          canonStatus: 2,
          aliases: [],
          tags: [],
          fields: [],
        },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }

    await page.goto(`/app/universes/${universeId}/lore`)
    await expectLaunched(page)
    // Lore opens on the catalog (Issue #60): each category a card, tapped to open its list.
    await expect(page.getByTestId('lore-catalog')).toBeVisible()
    const card = page.locator('[data-testid="lore-type-card"][data-type-name="Character"]')
    await expect(card).toContainText('1 entry')
    await card.tap()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${character.id}$`))
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(page.getByTestId('entity-card')).toContainText('PWA Character visible')

    await page.getByTestId('lore-type-menu').tap()
    await page
      .getByTestId('lore-type-menu-panel')
      .getByRole('link', { name: 'Location', exact: true })
      .tap()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${location.id}$`))
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(page.getByTestId('entity-card')).toContainText('PWA Location visible')
    await expect(page.getByTestId('entity-card')).not.toContainText('PWA Character visible')
    await expect(page.getByTestId('lore-load-error')).toHaveCount(0)

    // Shown, not merely present: the card is visible, and nothing fixed or sticky covers it once it is scrolled to.
    await expect(page.getByTestId('entity-card')).toBeVisible()
    await page.getByTestId('entity-card').scrollIntoViewIfNeeded()
    await expectUncovered(page, 'entity-card')
  })

  test('a failed read of the categories says so and recovers, instead of reporting a universe with none', async ({
    page,
  }) => {
    await asInstalled(page)
    await signUp(page)
    const universeId = await newUniverse(page)
    const types = (await (
      await page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const character = types.find((type) => type.name === 'Character')!
    const made = await page.request.post(`/api/universes/${universeId}/entities`, {
      data: {
        entityTypeId: character.id,
        name: 'Survives a dropped request',
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    expect(made.ok(), await made.text()).toBe(true)

    // Reads of the categories are lost, as a phone on a poor connection or waking from the background loses them.
    let offline = true
    await page.route(
      (url) => url.pathname.endsWith(`/api/universes/${universeId}/entity-types`),
      (route) => (offline ? route.abort('failed') : route.continue()),
    )

    await page.goto(`/app/universes/${universeId}/lore?type=${character.id}`)
    await expectLaunched(page)
    await expect(page.getByTestId('lore-types-error')).toBeVisible()
    await expect(page.getByTestId('lore-no-types')).toHaveCount(0)
    // The chosen category stays in the address: a failed read is not a category that does not exist.
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${character.id}$`))

    offline = false
    await page.getByTestId('lore-types-error').getByRole('button', { name: 'Try again' }).tap()
    await expect(page.getByTestId('lore-types-error')).toHaveCount(0)
    await expect(page.getByTestId('entity-card')).toBeVisible()
    await expect(page.getByTestId('entity-card')).toContainText('Survives a dropped request')
  })

  test('the Lore category menu opens on screen, chooses a category, and the choice survives a reload and a new window', async ({
    page,
    browser,
  }) => {
    await asInstalled(page)
    await withSafeAreas(page)

    await signUp(page)
    const universeId = await newUniverse(page)

    // Launched as an installed app: the layer draws, then lifts.
    await page.goto(`/app/universes/${universeId}/lore`)
    await expectLaunched(page)

    // The sticky bar carries the top inset where the page has one; the Category control sits under it, on screen,
    // and nothing covers it.
    const inset = await safeAreaTop(page)
    test.info().annotations.push({
      type: 'safe-area-inset-top',
      description:
        inset > 0
          ? `${inset}px, applied by the DevTools protocol`
          : 'none: this Chromium resolves env() to 0, so the sticky bar is tested without a status bar',
    })
    if (inset > 0) {
      const bar = (await page.locator('.rail').boundingBox())!
      expect(bar.height, 'the sticky bar did not grow for the status bar').toBeGreaterThanOrEqual(
        inset + 36,
      )
    }
    // The catalog first (Issue #60): a category's card is on screen, uncovered, a finger's size, and opens its list.
    await expect(page.getByTestId('lore-catalog')).toBeVisible()
    const first = (await page.getByTestId('lore-type-card').first().boundingBox())!
    const bar = (await page.locator('.rail').boundingBox())!
    expect(first.y, 'the first card is under the sticky bar').toBeGreaterThanOrEqual(
      bar.y + bar.height - 1,
    )
    expect(first.y + first.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
    expect(first.x + first.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    expect(first.height).toBeGreaterThanOrEqual(44)
    await expectUncovered(page, 'lore-type-card')
    await page.locator('[data-testid="lore-type-card"][data-type-name="Location"]').tap()
    const trigger = page.getByTestId('lore-type-menu')
    await expect(trigger).toHaveAccessibleName('Category: Location')
    await expectOnScreen(page, 'lore-type-menu')
    await expectUncovered(page, 'lore-type-menu')
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    // Tap: the menu opens inside the viewport, its current item focused, every starter type in it.
    await trigger.tap()
    const menu = page.getByTestId('lore-type-menu-panel')
    await expect(menu).toBeVisible()
    await expectOnScreen(page, 'lore-type-menu-panel')
    await expectUncovered(page, 'lore-type-menu-panel')
    // The open category is where the focus lands, so the reader starts from where they are.
    await expect(menu.getByRole('link', { name: 'Location', exact: true })).toBeFocused()

    // Choose: the address says so, the control says so, the list is that category's.
    await menu.getByRole('link', { name: 'Character', exact: true }).tap()
    await expect(page).toHaveURL(/\/lore\?type=[0-9a-f-]+$/)
    await expect(trigger).toHaveAccessibleName('Category: Character')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Character')
    await expect(page.getByTestId('lore-catalog')).toHaveCount(0)
    const chosen = page.url()

    // The choice is the address, so a reload - in the same window, which never replays the launch - keeps it.
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-launch')
    await expect(trigger).toHaveAccessibleName('Category: Character')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Character')

    // A fresh launch of the same address: the layer again, then the same category.
    const fresh = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      storageState: await page.context().storageState(),
    })
    const again = await fresh.newPage()
    await asInstalled(again)
    await again.goto(chosen)
    await expectLaunched(again)
    await expect(again.getByTestId('lore-type-menu')).toHaveAccessibleName('Category: Character')
    await expect(again.getByRole('heading', { level: 1 })).toHaveText('Character')
    await fresh.close()
  })

  test("an entry's Type is chosen from the form's picker, saved, and still that type after a reload", async ({
    page,
  }) => {
    await asInstalled(page)
    await withSafeAreas(page)
    await signUp(page)
    const universeId = await newUniverse(page)
    const types = (await (
      await page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const character = types.find((type) => type.name === 'Character')!
    const place = types.find((type) => type.name === 'Location')!

    // New entry, opened as the installed app opens it.
    await page.goto(`/app/universes/${universeId}/lore/new?type=${character.id}`)
    await expectLaunched(page)

    // The Type picker: a native <select>, reachable, uncovered, and changed to another type.
    const picker = page.getByLabel('Entry type')
    await expect(picker).toBeVisible()
    const box = (await picker.boundingBox())!
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      [box.x + box.width / 2, box.y + box.height / 2],
    )
    expect(hit, 'something covers the Type picker').toBe('Entry type')
    await picker.selectOption(place.id)
    await expect(picker).toHaveValue(place.id)

    await page.getByLabel('Name').fill('The Dust Abbey')
    await page.getByRole('button', { name: 'Create entry' }).click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const entryId = page.url().split('/').pop()!

    // Saved as that type - what the API holds, not only what the screen drew - and still so after a reload.
    const saved = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${entryId}`)
    ).json()) as { entityTypeId: string; entityTypeName: string }
    expect(saved.entityTypeId).toBe(place.id)
    expect(saved.entityTypeName).toBe('Location')
    await page.reload()
    await expect(page.getByTestId('entry-type')).toHaveText('Location')

    // And editing it keeps the picker reachable with the saved type chosen.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByLabel('Entry type')).toHaveValue(place.id)
  })

  test('the Category menu is reachable when the page has been scrolled and the virtual keyboard is away', async ({
    page,
  }) => {
    await asInstalled(page)
    await withSafeAreas(page)
    await signUp(page)
    const universeId = await newUniverse(page)
    const types = (await (
      await page.request.get(`/api/universes/${universeId}/entity-types`)
    ).json()) as { id: string; name: string }[]
    const character = types.find((type) => type.name === 'Character')!
    for (let i = 0; i < 12; i++) {
      await page.request.post(`/api/universes/${universeId}/entities`, {
        data: {
          entityTypeId: character.id,
          name: `Pilgrim ${i}`,
          summary: null,
          canonStatus: 2,
          aliases: [],
          tags: [],
          fields: [],
        },
      })
    }

    await page.goto(`/app/universes/${universeId}/lore?type=${character.id}`)
    await expectLaunched(page)
    await expect(page.getByTestId('entity-card').first()).toBeVisible()

    // Scrolled to the foot of the list, the sticky bar still clears the controls when scrolled back to them.
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(200)
    await page.getByTestId('lore-type-menu').scrollIntoViewIfNeeded()
    await expectOnScreen(page, 'lore-type-menu')
    await expectUncovered(page, 'lore-type-menu')

    // Filters opened and typed into (the keyboard would be up), then closed: the menu still opens and chooses.
    await page.getByTestId('lore-filters-toggle').tap()
    await page.getByLabel('Filter entries').fill('Pilgrim 1')
    await page.getByTestId('lore-filters-toggle').tap()
    await page.getByTestId('lore-type-menu').tap()
    const menu = page.getByTestId('lore-type-menu-panel')
    await expect(menu).toBeVisible()
    await expectOnScreen(page, 'lore-type-menu-panel')
    await menu.getByRole('link', { name: 'Location', exact: true }).tap()
    await expect(page.getByTestId('lore-type-menu')).toHaveAccessibleName('Category: Location')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Location')
  })
})

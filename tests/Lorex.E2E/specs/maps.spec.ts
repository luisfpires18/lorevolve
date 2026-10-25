import { expect, test, type Page } from '@playwright/test'
import { png, type Rgb } from './support/png'

/**
 * Maps (issue #52): what only a browser can prove about a map and its pins.
 *
 * The API tests settle what is stored, who may read it and what a replacement does to the rows. What they cannot show
 * is that an author can do it: upload a picture, place a pin on it with the pointer and with the keyboard, link the pin
 * to an entry, walk from the pin to the entry and from the entry back to the pin, and find everything where it was after
 * a reload. That is this file - at a desktop width, on a phone, and from the keyboard.
 *
 * Nothing here needs Cloudflare: the dev server runs the in-memory object store.
 */

const PASSWORD = 'Test-password-123!'
const SEA: Rgb = [40, 90, 160]
const LAND: Rgb = [120, 160, 80]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** A map: sea on the left half, land on the right. */
function mapPicture(name: string, width = 800, height = 500) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(width, height, (x) => (x < width / 2 ? SEA : LAND)),
  }
}

async function signUp(page: Page) {
  const username = unique('cartographer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function createUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Arkazia '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/** On a phone the workspace navigation folds into one bar, so a section has to be opened first. */
async function openSection(page: Page, testId: string, narrow: boolean) {
  if (narrow) await page.getByTestId('workspace-nav-toggle').click()
  await page.getByTestId(testId).click()
}

/** A new entry of the starter Character type, created and left on its page. */
async function createEntry(page: Page, universeId: string, name: string) {
  await page.goto(`/app/universes/${universeId}/lore/new`)
  await page.getByLabel('Name').fill(name)
  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/** Uploads a map through the Maps section and lands on its page. */
async function createMap(page: Page, universeId: string, name: string, narrow = false) {
  await page.goto(`/app/universes/${universeId}`)
  await openSection(page, 'workspace-maps', narrow)
  await page.waitForURL(/\/maps$/)
  await expect(page.getByTestId('maps-empty')).toBeVisible()
  await page.getByTestId('new-map').click()
  const form = page.getByTestId('map-form')
  await form.getByTestId('map-name-input').fill(name)
  await form.getByTestId('map-description-input').fill('Sea to the west, land to the east.')
  await form.getByTestId('map-file-input').setInputFiles(mapPicture('world.png'))
  await expect(form.getByTestId('map-file-chosen')).toContainText('world.png')
  await form.getByTestId('map-form-save').click()
  await page.waitForURL(/\/maps\/[0-9a-f-]+$/)
  await expect(page.getByTestId('map-name')).toHaveText(name)
  return page.url().split('/').pop()!
}

test.describe('a map of the world', () => {
  test('an author uploads a map, pins an entry on it and walks between the pin and the entry', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await createUniverse(page)
    const capital = unique('Sylvara ')
    const entityId = await createEntry(page, universeId, capital)

    // The entry is on no map yet, and says so.
    await expect(page.getByTestId('entry-maps-none')).toBeVisible()

    const mapName = unique('The Known World ')
    const mapId = await createMap(page, universeId, mapName)

    // The picture is drawn whole and fitted; its pins are none.
    const stage = page.getByTestId('map-stage')
    await expect(stage.locator('img')).toHaveAttribute(
      'src',
      new RegExp(`^/api/universes/${universeId}/maps/${mapId}/image/[0-9a-f-]+/display$`),
    )
    await expect(page.getByTestId('map-pins-empty')).toBeVisible()
    const fitScale = Number(await stage.getAttribute('data-scale'))
    expect(fitScale).toBeGreaterThan(0)

    // ---------- A pin placed with the pointer, on the land, linked to the capital ----------

    await page.getByTestId('map-add-pin').click()
    await expect(page.getByTestId('map-placing-hint')).toBeVisible()
    const box = (await stage.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)

    const pinForm = page.getByTestId('map-pin-form')
    await expect(pinForm).toBeVisible()
    await pinForm.getByTestId('picker-input').fill(capital.slice(0, 7))
    await pinForm.getByTestId(`picker-option-${capital}`).click()
    // Choosing the entry named the pin; the title stays the author's.
    await expect(pinForm.getByTestId('map-pin-title-input')).toHaveValue(capital)
    await pinForm.getByTestId('map-pin-note-input').fill('The capital, on the eastern shore.')
    const across = Number(await pinForm.getByTestId('map-pin-x-input').inputValue())
    expect(across).toBeGreaterThan(50)
    await pinForm.getByTestId('map-pin-save').click()
    await expect(pinForm).toHaveCount(0)

    // On the picture, in the list, in the address, and in the card.
    const pin = page.locator(`[data-testid="map-pin"][data-pin-title="${capital}"]`)
    await expect(pin).toBeVisible()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.locator(`[data-testid="map-pin-row"][data-pin-title="${capital}"]`),
    ).toBeVisible()
    await expect(page).toHaveURL(/\?pin=[0-9a-f-]+$/)
    const pinId = new URL(page.url()).searchParams.get('pin')!
    await expect(page.getByTestId('map-pin-card-note')).toHaveText(
      'The capital, on the eastern shore.',
    )

    // The pin keeps its place on the picture whatever the zoom.
    const placedAt = await pin.evaluate((element) => [element.style.left, element.style.top])
    await page.getByTestId('map-zoom-in').click()
    await expect(stage).not.toHaveAttribute('data-scale', fitScale.toFixed(4))
    expect(await pin.evaluate((element) => [element.style.left, element.style.top])).toEqual(
      placedAt,
    )
    await page.getByTestId('map-fit').click()
    await expect(stage).toHaveAttribute('data-scale', fitScale.toFixed(4))

    // ---------- From the pin to the entry, and back ----------

    await page.getByTestId('map-pin-open-entry').click()
    await page.waitForURL(new RegExp(`/lore/${entityId}$`))
    await expect(page.getByTestId('entry-name')).toHaveText(capital)
    const back = page.locator(`[data-testid="entry-map-link"][data-map-name="${mapName}"]`)
    await expect(back).toBeVisible()
    await back.click()
    await page.waitForURL(new RegExp(`/maps/${mapId}\\?pin=${pinId}$`))
    await expect(
      page.locator(`[data-testid="map-pin"][data-pin-title="${capital}"]`),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('map-pin-card')).toContainText(capital)

    // ---------- After a reload, exactly the same ----------

    await page.reload()
    await expect(page.getByTestId('map-name')).toHaveText(mapName)
    const reloaded = page.locator(`[data-testid="map-pin"][data-pin-title="${capital}"]`)
    await expect(reloaded).toHaveAttribute('aria-pressed', 'true')
    expect(await reloaded.evaluate((element) => [element.style.left, element.style.top])).toEqual(
      placedAt,
    )

    // ---------- A second pin, from the keyboard alone ----------

    await page.getByTestId('map-add-pin').click()
    await page.getByTestId('map-place-centre').click()
    const typed = page.getByTestId('map-pin-form')
    await typed.getByTestId('map-pin-title-input').fill('Here be dragons')
    await typed.getByTestId('map-pin-x-input').fill('10')
    await typed.getByTestId('map-pin-y-input').fill('20')
    await typed.getByTestId('map-pin-save').click()
    await expect(typed).toHaveCount(0)
    const dragons = page.locator('[data-testid="map-pin"][data-pin-title="Here be dragons"]')
    expect(await dragons.evaluate((element) => [element.style.left, element.style.top])).toEqual([
      '10%',
      '20%',
    ])
    await expect(page.getByTestId('map-pin-row')).toHaveCount(2)

    // The viewer itself answers the keyboard: focus it, zoom, fit.
    await stage.focus()
    await page.keyboard.press('+')
    await expect(stage).not.toHaveAttribute('data-scale', fitScale.toFixed(4))
    await page.keyboard.press('0')
    await expect(stage).toHaveAttribute('data-scale', fitScale.toFixed(4))

    // Another pin chosen from the list; then Tab reaches a pin on the picture and Enter selects it.
    await page.locator(`[data-testid="map-pin-row"][data-pin-title="${capital}"]`).click()
    await expect(page.getByTestId('map-pin-card')).toContainText(capital)
    await dragons.focus()
    await page.keyboard.press('Enter')
    await expect(dragons).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('map-pin-card')).toContainText('Here be dragons')
    await expect(page.getByTestId('map-pin-card')).toContainText('An annotation')

    // ---------- The scale (#53): two typed points, a distance, a unit the author names ----------

    await expect(page.getByTestId('map-scale-none')).toBeVisible()
    await page.getByTestId('map-calibrate').click()
    const calibration = page.getByTestId('map-calibration-form')
    await expect(page.getByTestId('map-calibrating-hint')).toBeVisible()
    await calibration.getByTestId('map-calibration-a-x').fill('10')
    await calibration.getByTestId('map-calibration-a-y').fill('50')
    await calibration.getByTestId('map-calibration-b-x').fill('90')
    await calibration.getByTestId('map-calibration-b-y').fill('50')
    await expect(page.getByTestId('map-marker')).toHaveCount(2)
    await calibration.getByTestId('map-calibration-distance').fill('400')
    await calibration.getByTestId('map-calibration-unit').fill('leagues')
    await calibration.getByTestId('map-calibration-save').click()
    await expect(calibration).toHaveCount(0)
    await expect(page.getByTestId('map-scale-text')).toContainText('400 leagues')
    await expect(page.getByTestId('map-scale-line')).toBeVisible()

    // ---------- The assistant answers from the pins, and only from them (#53) ----------

    await page.getByRole('button', { name: 'Assistant' }).click()
    await expect(page.getByTestId('assistant-drawer')).toBeVisible()
    await page.getByTestId('assistant-input').fill(`Where is ${capital}?`)
    await page.getByTestId('assistant-ask').click()
    const located = page.getByTestId('assistant-turn').last()
    await expect(located.getByTestId('assistant-answer')).toContainText(
      `is pinned on the map ${mapName}`,
    )
    await expect(located.getByTestId('assistant-source').first()).toHaveAttribute(
      'href',
      `/app/universes/${universeId}/maps/${mapId}?pin=${pinId}`,
    )
    await page.getByTestId('assistant-input').fill('Where is Atlantis?')
    await page.getByTestId('assistant-ask').click()
    await expect(
      page.getByTestId('assistant-turn').last().getByTestId('assistant-answer'),
    ).toContainText('records no map location')
    await expect(
      page.getByTestId('assistant-turn').last().getByTestId('assistant-source'),
    ).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('assistant-drawer')).toHaveCount(0)

    // ---------- The picture replaced, pins kept for review ----------

    await page.getByTestId('map-actions').click()
    await page.getByTestId('map-replace-image').click()
    const replace = page.getByTestId('map-form')
    await replace.getByTestId('map-file-input').setInputFiles(mapPicture('world-2.png', 1000, 400))
    await replace.getByTestId('map-replace-keep').check()
    await replace.getByTestId('map-form-save').click()
    await expect(replace).toHaveCount(0)
    await expect(page.getByTestId('map-review-notice')).toContainText(
      '2 pins were placed on an earlier picture',
    )
    // The scale was measured on the picture that went: it is gone with it.
    await expect(page.getByTestId('map-scale-none')).toBeVisible()
    await expect(stage.locator('img')).toHaveAttribute('width', '1000')
    await expect(dragons).toHaveAttribute('data-review', 'true')

    // Saving a pin confirms its place.
    await page.getByTestId('map-pin-edit').click()
    const review = page.getByTestId('map-pin-form')
    await expect(review.getByTestId('map-pin-review-note')).toBeVisible()
    await review.getByTestId('map-pin-save').click()
    await expect(review).toHaveCount(0)
    await expect(dragons).not.toHaveAttribute('data-review', 'true')
    await expect(page.getByTestId('map-review-notice')).toContainText('One pin was placed')

    // ---------- Removed, and the entry knows ----------

    await page.locator(`[data-testid="map-pin-row"][data-pin-title="${capital}"]`).click()
    await page.getByTestId('map-pin-remove').click()
    await page.getByRole('button', { name: 'Remove pin' }).click()
    await expect(page.locator(`[data-testid="map-pin"][data-pin-title="${capital}"]`)).toHaveCount(
      0,
    )
    await page.goto(`/app/universes/${universeId}/lore/${entityId}`)
    await expect(page.getByTestId('entry-maps-none')).toBeVisible()
  })
})

test.describe('a map on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a pin is placed and read in a 390px column without sideways scroll', async ({ page }) => {
    await signUp(page)
    const universeId = await createUniverse(page)
    const mapName = unique('Pocket map ')
    await createMap(page, universeId, mapName, true)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await page.getByTestId('map-add-pin').click()
    await page.getByTestId('map-place-centre').click()
    const form = page.getByTestId('map-pin-form')
    await form.getByTestId('map-pin-title-input').fill('The harbour')
    await form.getByTestId('map-pin-save').click()
    await expect(form).toHaveCount(0)

    const pin = page.locator('[data-testid="map-pin"][data-pin-title="The harbour"]')
    await expect(pin).toBeVisible()
    await expect(page.getByTestId('map-pin-card')).toContainText('The harbour')

    // The pin's head is a usable target on a touch screen, and the list beside the picture is reachable below it.
    const head = (await pin.locator('.mappin__head').boundingBox())!
    expect(Math.min(head.width, head.height)).toBeGreaterThanOrEqual(16)
    await expect(page.getByTestId('map-pin-row')).toHaveCount(1)
    await page.reload()
    await expect(
      page.locator('[data-testid="map-pin"][data-pin-title="The harbour"]'),
    ).toBeVisible()
  })
})

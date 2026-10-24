import { expect, test, type Page } from '@playwright/test'

/**
 * One journey through Lorex on a phone, and no more than that.
 *
 * Every screen in this file is already covered at desktop width by another spec, so nothing
 * here re-proves what the product does. What a narrow viewport proves instead is that the
 * product is still operable when the chrome has folded away: that the section list is
 * reachable and says where you are, that authoring an entry works in a 390px column, that
 * the action a screen exists for is in reach without a three-thousand pixel scroll, that the
 * picker at the foot of a drawer opens somewhere you can see, and that nothing anywhere put
 * a sideways scrollbar on the document.
 *
 * Deliberately one journey and a handful of measurements rather than a gallery of viewport
 * snapshots: a snapshot per screen would fail on every legitimate copy edit and prove less.
 */

const PASSWORD = 'Test-password-123!'

// A phone in portrait. hasTouch and isMobile together are what make the coarse-pointer
// rules - the ones that grow the hit areas - actually apply.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** The document must never scroll sideways. One pixel of rounding is not a defect. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

async function signUp(page: Page) {
  const username = unique('pocket')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** Opens the collapsed section list and goes to one section. */
async function openSection(page: Page, testId: string) {
  const toggle = page.getByTestId('workspace-nav-toggle')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId(testId).click()
}

test.describe('on a phone', () => {
  test('a world can be opened, navigated, authored and placed in time in a 390px column', async ({
    page,
  }) => {
    await signUp(page)
    await expectNoSidewaysScroll(page, 'universes')

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Pocket World '))
    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    const universeId = page.url().split('/').pop()!

    // ---- The chrome folded away, but it still says where you are ----

    // The desktop sidebar is not sitting on the screen...
    await expect(page.locator('.sidebar')).toBeHidden()
    // ...and the bar that replaces it names the universe and the section.
    const where = page.getByTestId('workspace-where')
    await expect(where).toContainText('Pocket World')
    await expect(where).toContainText('Overview')

    const toggle = page.getByTestId('workspace-nav-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Opening is one obvious, labelled control, and the list is real navigation.
    await openSection(page, 'workspace-lore')
    await page.waitForURL(/\/lore$/)

    // Arriving closes it again, so a section is never read through its own menu.
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(where).toContainText('Lore')
    await expectNoSidewaysScroll(page, 'lore browse')

    // ---- Authoring, in the same column ----

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill('Veyra Alkenmoor')
    await page
      .getByLabel('Summary')
      .fill('Third daughter of a house whose charter had already begun to fray.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toHaveText('Veyra Alkenmoor')
    await expectNoSidewaysScroll(page, 'dossier')

    // ---- The actions the screen exists for are in reach ----

    // An entry is the tallest screen in the product, and everything that acts on the entry is in
    // its header rather than under whatever was written. So at the top of one, unscrolled, all of
    // it is on screen - and it stays there however long the article grows, because none of it is
    // below the article any more.
    const viewport = page.viewportSize()!
    for (const testId of ['edit-entity', 'entity-family-tree', 'entity-actions']) {
      const target = (await page.getByTestId(testId).boundingBox())!
      expect(target.y + target.height, `${testId} is below the fold`).toBeLessThanOrEqual(
        viewport.height,
      )
      expect(target.height, `${testId} is smaller than a thumb`).toBeGreaterThanOrEqual(44)
      expect(target.height, `${testId} wrapped onto a second line`).toBeLessThan(60)
    }

    // The entry's own views are four ordinary links - Article, Eras, Relations, History - on one line, and the one being
    // read says so.
    const views = page.getByTestId('entry-views')
    await expect(views.getByRole('link')).toHaveCount(4)
    await expect(page.getByTestId('entry-view-article')).toHaveAttribute('aria-current', 'page')
    const strip = (await views.boundingBox())!
    expect(strip.height, 'the four views wrapped onto a second line').toBeLessThan(60)

    // Each of them is a place, reached and left the way any other page is.
    await page.getByTestId('entry-view-relations').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+\/relations$/)
    await expect(page.getByTestId('entry-view-relations')).toHaveAttribute('aria-current', 'page')
    await expectNoSidewaysScroll(page, 'relations')
    await page.goBack()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // And Edit works from the header, without scrolling to find it. The form it opens keeps its own
    // bar stuck to the bottom edge, which is where Save belongs while a form is being filled in.
    await page.getByTestId('edit-entity').click()
    const actions = page.locator('.entry__actions')
    await expect(actions).toHaveCSS('position', 'sticky')
    const bar = (await actions.boundingBox())!
    expect(bar.y, 'the save bar is below the fold').toBeLessThan(viewport.height)
    await page.getByLabel('Name').fill('Veyra of Ironvale')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-name')).toHaveText('Veyra of Ironvale')
    await expectNoSidewaysScroll(page, 'entry after an edit')

    // ---- A complex view: the chronology, through the drawer ----

    await openSection(page, 'workspace-timeline')
    await page.waitForURL(/\/timeline$/)
    await expect(where).toContainText('Timeline')
    await expectNoSidewaysScroll(page, 'timeline')

    await page.getByTestId('new-moment').click()
    await expect(page.getByTestId('moment-form')).toBeVisible()
    await page.getByTestId('moment-title').fill('Veyra refuses the Ironvale charter')
    await page.getByLabel('Year', { exact: true }).fill('823')

    // The participant picker is the last field in the drawer, and its result list drops
    // out of the field. On a phone that used to land under the drawer's own action bar,
    // off the bottom of the screen. It has to open somewhere a finger can reach it.
    await page.getByTestId('participant-input').fill('Veyra')
    const option = page.getByTestId('participant-option-Veyra of Ironvale')
    await expect(option).toBeVisible()
    const list = (await page.locator('.picker__list').boundingBox())!
    expect(list.y, 'the picker list opens above the top of the screen').toBeGreaterThanOrEqual(0)
    expect(
      list.y + list.height,
      'the picker list opens below the bottom of the screen',
    ).toBeLessThanOrEqual(viewport.height + 1)
    await option.click()

    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('chron-stream')).toContainText(
      'Veyra refuses the Ironvale charter',
    )
    await expect(page.getByTestId('chron-stream')).toContainText('Veyra of Ironvale')
    await expectNoSidewaysScroll(page, 'timeline with a moment')

    // ---- And Canon integrity, the densest read-only screen ----

    await openSection(page, 'workspace-canon')
    await page.waitForURL(/\/canon$/)
    await expect(where).toContainText('Canon')
    await expect(page.getByTestId('canon-empty')).toBeVisible()
    await expectNoSidewaysScroll(page, 'canon integrity')

    // The screen is not only legible on a phone, it is operable: the run reports back.
    await page.getByTestId('empty-evaluate-canon').click()
    await expect(page.getByTestId('canon-run')).toContainText('Evaluated')
    await expectNoSidewaysScroll(page, 'canon integrity after a run')

    // Types and the Trash close the set of sections a phone has to reach.
    await openSection(page, 'workspace-types')
    await page.waitForURL(/\/types$/)
    await expect(page.getByTestId('type-list')).toBeVisible()
    await expectNoSidewaysScroll(page, 'types')

    await openSection(page, 'workspace-trash')
    await page.waitForURL(/\/trash$/)
    await expect(page.getByTestId('trash-empty')).toBeVisible()
    await expectNoSidewaysScroll(page, 'trash')

    // The way back to the universes is at the head of the Sections sheet; the bar's mark is Lorex's, and leads to
    // Lorex's home (031).
    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    expect(page.url()).not.toContain(universeId)
    await page.goBack()
    await page.locator('.rail__mark').click()
    await page.waitForURL('/')
  })
})

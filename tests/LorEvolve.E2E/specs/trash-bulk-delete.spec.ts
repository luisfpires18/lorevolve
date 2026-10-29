import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  everyKind,
  heldCopies,
  keepCopies,
  row,
  seeder,
  sideways,
  signUp,
  trashCount,
  world,
} from './support/trash'

/**
 * Product refinement 023. The Trash's Select: rows become their checkboxes, page by page, and one red Delete permanently (N)
 * asks once - naming every row, what goes with each kind and that it cannot be undone - then erases them all in one request.
 * The graph that goes and the all-or-none rule are proved by the API tests; this file proves the mode, the question, the
 * focus, the drafts this browser keeps, and that it all fits at every width.
 */

function bar(page: Page) {
  return page.getByTestId('trash-selectbar')
}

function bulkDelete(page: Page) {
  return page.getByTestId('trash-bulk-delete')
}

function selectedCount(page: Page) {
  return page.getByTestId('trash-selected-count')
}

function confirmPanel(page: Page) {
  return page.getByTestId('trash-bulk-confirm')
}

/** Every request the page sends that could erase something. */
function erasures(page: Page) {
  const seen: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'DELETE' || request.url().includes('/bulk-delete')) {
      seen.push(`${request.method()} ${new URL(request.url()).pathname}`)
    }
  })
  return seen
}

/** The colour `--danger` resolves to here, as a background. */
function dangerColour(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.background = 'var(--danger)'
    document.body.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })
}

/** A control's resting background - measured with the pointer away, so a hover tint is not mistaken for it. */
async function background(locator: Locator) {
  await locator.page().mouse.move(0, 0)
  return locator.evaluate((node) => getComputedStyle(node).backgroundColor)
}

/** A control's resting ink, measured the same way. */
async function colour(locator: Locator) {
  await locator.page().mouse.move(0, 0)
  return locator.evaluate((node) => getComputedStyle(node).color)
}

/** Bins Relic 01 to Relic <count>, answering each one's id by name. */
async function binEntries(page: Page, universeId: string, count: number) {
  const seed = seeder(page, universeId)
  const ids = new Map<string, string>()
  for (let index = 1; index <= count; index += 1) {
    const name = `Relic ${String(index).padStart(2, '0')}`
    const entry = await seed.entry(name)
    await entry.bin()
    ids.set(name, entry.id)
  }
  return ids
}

test.describe('deleting a selection from the Trash permanently', () => {
  test('Select is a mode of its own, scoped to the page on screen, with one red action', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const relics = await binEntries(page, universeId, 13)
    const sent = erasures(page)

    await page.goto(`/app/universes/${universeId}/trash`)
    const list = page.getByTestId('trash-list')
    await expect(list.locator('li')).toHaveCount(12)

    // Ordinary browsing: no checkboxes, no bar; Restore and Delete permanently… on every row.
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.getByTestId('restore-Relic 13')).toBeVisible()
    const select = page.getByTestId('trash-select')
    await expect(select).toHaveAttribute('aria-pressed', 'false')

    // Selecting: a checkbox per visible row, named by kind and name; the rows' own actions step aside.
    await select.click()
    await expect(select).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('checkbox')).toHaveCount(12)
    await expect(page.getByRole('checkbox', { name: 'Select entry “Relic 13”' })).toBeVisible()
    await expect(page.locator('[data-testid^="restore-"]')).toHaveCount(0)
    await expect(page.locator('[data-testid^="erase-"]')).toHaveCount(0)
    await expect(selectedCount(page)).toHaveAttribute('role', 'status')
    await expect(selectedCount(page)).toHaveText(
      'Select rows on this page to delete them permanently.',
    )

    // Nothing selected: the red action says what it does, and cannot be pressed.
    await expect(bulkDelete(page)).toBeDisabled()
    await expect(bulkDelete(page)).toHaveText('Delete permanently')

    // The row is the checkbox's label; the keyboard's Space works on the box itself.
    await row(page, 'Relic 13').locator('.trash__name').click()
    await expect(selectedCount(page)).toHaveText('1 selected')
    await expect(row(page, 'Relic 13')).toHaveAttribute('data-selected', 'true')
    await page.getByTestId('select-Relic 12').focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('select-Relic 12')).toBeChecked()
    await expect(selectedCount(page)).toHaveText('2 selected')
    await expect(bulkDelete(page)).toHaveText('Delete permanently (2)')
    await expect(bulkDelete(page)).toBeEnabled()

    // Red ink is the established danger treatment, on that button only - quiet, since the question comes after it; the
    // selection's tools stay neutral.
    const danger = await dangerColour(page)
    await expect(bulkDelete(page)).toHaveClass(/button--danger-quiet/)
    await expect.poll(() => colour(bulkDelete(page))).toBe(danger)
    for (const id of [
      'trash-select-page',
      'trash-clear-selection',
      'trash-select-done',
      'trash-select',
    ]) {
      await expect(page.getByTestId(id)).not.toHaveClass(/button--danger/)
      expect(await background(page.getByTestId(id)), id).not.toBe(danger)
    }
    expect(await background(row(page, 'Relic 13')), 'a selected row').not.toBe(danger)

    // Select page: every visible row, and only those; then the next step has the focus.
    await page.getByTestId('trash-select-page').click()
    await expect(selectedCount(page)).toHaveText('12 selected')
    await expect(bulkDelete(page)).toHaveText('Delete permanently (12)')
    await expect(bulkDelete(page)).toBeFocused()
    await expect(page.getByTestId('trash-select-page')).toBeDisabled()

    // Clear selection: none, focus on Select page.
    await page.getByTestId('trash-clear-selection').click()
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await expect(page.getByTestId('trash-select-page')).toBeFocused()

    // Another page is another list: nothing carried there, nothing brought back.
    await page.getByTestId('select-Relic 13').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await expect(selectedCount(page)).toHaveText(
      'Select rows on this page to delete them permanently.',
    )
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByTestId('select-Relic 13')).not.toBeChecked()

    // A reload starts ordinary browsing again, with no selection.
    await page.getByTestId('select-Relic 13').check()
    await page.reload()
    await expect(list.locator('li')).toHaveCount(12)
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    // Done leaves selecting safely: the rows' actions are back, and Restore works as ever.
    await select.click()
    await page.getByTestId('select-Relic 13').check()
    await page.getByTestId('trash-select-done').click()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(select).toBeFocused()
    await page.getByTestId('restore-Relic 13').click()
    await expect(page.getByTestId('trash-message')).toContainText('is back in your lore')
    expect(sent).toEqual([])

    // Deleting the whole of the last page steps back to the page before it, never an empty one.
    await page.request.delete(`/api/universes/${universeId}/entities/${relics.get('Relic 13')}`)
    await page.reload()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(list.locator('li')).toHaveCount(1)
    await select.click()
    await page.getByTestId('trash-select-page').click()
    await bulkDelete(page).click()
    await page.getByTestId('trash-bulk-delete-confirm').click()
    await expect(page.getByTestId('trash-message')).toHaveText('1 item was permanently deleted.')
    await expect(list.locator('li')).toHaveCount(12)
    await expect(page.locator('.pager')).toHaveCount(0)
    expect(sent).toHaveLength(1)
  })

  test('the question names every row and what goes with each kind; Cancel and Escape delete nothing', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const names = await everyKind(page, universeId)
    const sent = erasures(page)

    await page.goto(`/app/universes/${universeId}/trash`)
    await page.getByTestId('trash-select').click()

    // Only a chapter: its consequence is the exception, and no other kind's words appear.
    await page.getByTestId(`select-${names.chapter}`).check()
    await bulkDelete(page).click()
    const panel = confirmPanel(page)
    await expect(panel).toBeFocused()
    await expect(panel).toHaveAccessibleName('Permanently delete 1 selected item?')
    const text = panel.getByTestId('trash-bulk-text')
    await expect(text).toContainText('Each chapter:')
    await expect(text).toContainText('The scenes it held moved to Unchaptered')
    await expect(text).not.toContainText('Each story:')
    await panel.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(bulkDelete(page)).toBeFocused()
    await expect(selectedCount(page)).toHaveText('1 selected')

    // Every kind: one question, never a request.
    await page.getByTestId('trash-select-page').click()
    await bulkDelete(page).click()
    await expect(panel).toBeFocused()
    await expect(panel).toHaveAccessibleName('Permanently delete 7 selected items?')
    await expect(panel).toHaveAccessibleDescription('This cannot be undone.')
    await expect(bar(page)).toHaveCount(0)
    const listed = panel.getByTestId('trash-bulk-list')
    for (const [kind, label] of [
      ['entry', 'Entry'],
      ['story', 'Story'],
      ['chapter', 'Chapter'],
      ['scene', 'Scene'],
      ['arc', 'Arc'],
      ['beat', 'Beat'],
      ['rule', 'World rule'],
    ] as const) {
      await expect(listed.getByText(`${label} ${names[kind]}`, { exact: true })).toBeVisible()
    }
    await expect(text).toContainText(
      'Each story: Everything in it goes with it: its chapters, its scenes',
    )
    await expect(text).toContainText('Each entry: Its article, fields, picture and saved versions')
    await expect(text).toContainText('links and references to it')
    await expect(text).toContainText('Each arc: Every beat in it goes with it')
    await expect(text).toContainText('Each chapter: Only the chapter goes')
    await expect(panel).toContainText('This cannot be undone.')
    const final = panel.getByTestId('trash-bulk-delete-confirm')
    await expect(final).toHaveText('Delete permanently')
    await expect(final).toHaveClass(/button--danger/)
    const red = await dangerColour(page)
    await expect.poll(() => background(final)).toBe(red)
    await expect(panel.getByTestId('trash-bulk-cancel')).not.toHaveClass(/button--danger/)

    // The selection cannot move underneath the question.
    await expect(page.getByTestId(`select-${names.entry}`)).toBeDisabled()

    // Cancel: nothing deleted, every row still selected, focus back on the red action.
    await panel.getByTestId('trash-bulk-cancel').click()
    await expect(panel).toHaveCount(0)
    await expect(bulkDelete(page)).toBeFocused()
    await expect(selectedCount(page)).toHaveText('7 selected')
    expect(sent).toEqual([])
    expect(await trashCount(page, universeId)).toBe(7)
  })

  test('a mixed selection goes in one request, says how many, and leaves selecting', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)
    const entry = await seed.entry('Mixed Relic')
    const kept = await seed.entry('Kept Relic')
    const saga = await seed.story('Mixed Saga')
    const scene = await saga.scene('Mixed Scene')
    const rule = await seed.rule('Mixed Rule')
    for (const thing of [entry, kept, scene, rule]) await thing.bin()
    const sent = erasures(page)

    await page.goto(`/app/universes/${universeId}/trash`)
    await page.getByTestId('trash-select').click()
    for (const name of ['Mixed Relic', 'Mixed Scene', 'Mixed Rule']) {
      await page.getByTestId(`select-${name}`).check()
    }
    await bulkDelete(page).click()

    // However eager the click: one request.
    await page.getByTestId('trash-bulk-delete-confirm').dblclick()
    await expect(page.getByTestId('trash-message')).toHaveText('3 items were permanently deleted.')
    await expect(page.locator('.trash__outcome')).toBeFocused()
    expect(sent).toEqual([`POST /api/universes/${universeId}/trash/bulk-delete`])

    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(page.getByTestId('trash-select')).toHaveAttribute('aria-pressed', 'false')
    for (const name of ['Mixed Relic', 'Mixed Scene', 'Mixed Rule']) {
      await expect(row(page, name)).toHaveCount(0)
    }
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(1)
    await expect(page.getByTestId('restore-Kept Relic')).toBeVisible()
    expect(await trashCount(page, universeId)).toBe(1)
  })

  test('a selected parent takes its own rows with it; a chapter leaves its scenes', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)

    const doomed = await seed.story('Doomed Saga')
    const selectedScene = await doomed.scene('Selected Scene')
    const unselectedScene = await doomed.scene('Unselected Scene')
    await selectedScene.bin()
    await unselectedScene.bin()
    await doomed.bin()

    const standing = await seed.story('Standing Saga')
    const chapter = await standing.chapter('Binned Chapter')
    await standing.scene('Unchaptered Survivor', chapter.id)
    await chapter.bin()
    const arc = await standing.arc('Binned Arc')
    const beat = await arc.beat('Binned Beat')
    await beat.bin()
    await arc.bin()

    await page.goto(`/app/universes/${universeId}/trash`)
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(6)
    await page.getByTestId('trash-select').click()
    for (const name of [
      'Doomed Saga',
      'Selected Scene',
      'Binned Chapter',
      'Binned Arc',
      'Binned Beat',
    ]) {
      await page.getByTestId(`select-${name}`).check()
    }
    await bulkDelete(page).click()
    await page.getByTestId('trash-bulk-delete-confirm').click()

    // Five selected, five said; the story's unselected row went with it.
    await expect(page.getByTestId('trash-message')).toHaveText('5 items were permanently deleted.')
    await expect(page.getByTestId('trash-empty')).toBeVisible()
    expect(await trashCount(page, universeId)).toBe(0)

    // The chapter's former scene is still in its story, in Unchaptered.
    const story = (await (
      await page.request.get(`/api/universes/${universeId}/stories/${standing.id}`)
    ).json()) as { scenes: { title: string; chapterId: string | null }[] }
    expect(story.scenes).toEqual([
      expect.objectContaining({ title: 'Unchaptered Survivor', chapterId: null }),
    ])
  })

  test('recovery copies: exactly what went, only after the server answered', async ({ page }) => {
    await signUp(page)
    const accountId = ((await (await page.request.get('/api/auth/me')).json()) as { id: string }).id
    const universeId = await world(page)
    const seed = seeder(page, universeId)

    const entry = await seed.entry('Drafted Relic')
    const changing = await seed.entry('Restored Elsewhere')
    const unrelated = await seed.entry('Unrelated Entry')
    const doomed = await seed.story('Drafted Chronicle')
    const sceneA = await doomed.scene('Scene A')
    const sceneB = await doomed.scene('Scene B')
    const standing = await seed.story('Standing Chronicle')
    const sceneC = await standing.scene('Scene C')
    const sceneD = await standing.scene('Scene D')
    const ideaId = 'e7a1d0c5-0000-4000-8000-000000000023'
    for (const thing of [entry, changing, doomed, sceneC]) await thing.bin()

    await page.goto(`/app/universes/${universeId}/trash`)
    await keepCopies(page, accountId, [
      { universeId, kind: 'article', contentId: entry.id },
      { universeId, kind: 'article', contentId: unrelated.id },
      { universeId, kind: 'manuscript', contentId: sceneA.id },
      { universeId, kind: 'manuscript', contentId: sceneB.id },
      { universeId, kind: 'manuscript', contentId: sceneC.id },
      { universeId, kind: 'manuscript', contentId: sceneD.id },
      { universeId: null, kind: 'idea', contentId: ideaId },
    ])
    const everyCopy = [
      entry.id,
      unrelated.id,
      sceneA.id,
      sceneB.id,
      sceneC.id,
      sceneD.id,
      ideaId,
    ].sort()
    expect(await heldCopies(page)).toEqual(everyCopy)

    const select = page.getByTestId('trash-select')
    await select.click()
    for (const name of ['Drafted Relic', 'Restored Elsewhere', 'Drafted Chronicle', 'Scene C']) {
      await page.getByTestId(`select-${name}`).check()
    }

    // Asking and cancelling lets nothing go.
    await bulkDelete(page).click()
    await page.getByTestId('trash-bulk-cancel').click()
    expect(await heldCopies(page)).toEqual(everyCopy)

    // A failure the list is still right about: nothing goes, the question and the selection stay for another try.
    await page.route('**/api/universes/*/trash/bulk-delete', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'SqliteException: database is locked', status: 500 }),
      }),
    )
    await bulkDelete(page).click()
    await page.getByTestId('trash-bulk-delete-confirm').click()
    const error = page.getByTestId('trash-bulk-error')
    await expect(error).toHaveText(
      'Nothing was deleted. The selected items could not be deleted just now. Try again.',
    )
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(page.getByText('Sqlite')).toHaveCount(0)
    await expect(page.getByTestId('trash-bulk-delete-confirm')).toHaveText('Delete permanently')
    expect(await heldCopies(page)).toEqual(everyCopy)
    expect(await trashCount(page, universeId)).toBe(4)
    await page.unroute('**/api/universes/*/trash/bulk-delete')

    // The Trash changed in another tab: nothing deleted, nothing let go, the selection let go and the list read again.
    expect(
      (await page.request.post(`/api/universes/${universeId}/trash/${changing.id}/restore`)).ok(),
    ).toBe(true)
    await page.getByTestId('trash-bulk-delete-confirm').click()
    await expect(page.getByTestId('trash-message')).toHaveText(
      'The Trash changed before these items could be deleted, so nothing was deleted. Select them again.',
    )
    await expect(page.locator('.trash__outcome')).toBeFocused()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(row(page, 'Restored Elsewhere')).toHaveCount(0)
    expect(await trashCount(page, universeId)).toBe(3)
    expect(await heldCopies(page)).toEqual(everyCopy)

    // Erased: the entry's article and the three scenes' manuscripts go; the unrelated entry, scene and idea stay.
    await select.click()
    await page.getByTestId('trash-select-page').click()
    await bulkDelete(page).click()
    await page.getByTestId('trash-bulk-delete-confirm').click()
    await expect(page.getByTestId('trash-message')).toHaveText('3 items were permanently deleted.')
    await expect.poll(() => heldCopies(page)).toEqual([unrelated.id, sceneD.id, ideaId].sort())
  })

  test('selecting and the question fit at every width, in both themes and at 200%, names isolated', async ({
    browser,
  }) => {
    // Seven sizes in two themes, each a fresh browser context.
    test.setTimeout(240_000)
    const setup = await browser.newContext()
    const page = await setup.newPage()
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)
    const rtlName = 'עידן האור הגדול והארוך מאוד'
    const longName =
      'The Exceedingly Long and Winding Chronicle of the Seven Drowned Crowns of Vael'
    const rtl = await seed.entry(rtlName)
    await rtl.bin()
    const long = await seed.story(longName)
    await long.bin()
    const saga = await seed.story('Sizing Saga')
    for (const name of ['One', 'Two', 'Three']) await (await saga.scene(`Scene ${name}`)).bin()
    const arc = await saga.arc('Sizing Arc')
    for (const name of ['One', 'Two']) await (await arc.beat(`Beat ${name}`)).bin()
    await (await seed.rule('Sizing Rule')).bin()
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta'])
      await (await seed.entry(`Relic ${name}`)).bin()
    const state = await setup.storageState()
    await setup.close()

    for (const theme of ['light', 'dark']) {
      for (const size of [
        { width: 1440, height: 900, deviceScaleFactor: 1 },
        { width: 1024, height: 768, deviceScaleFactor: 1 },
        { width: 820, height: 1180, deviceScaleFactor: 1 },
        { width: 640, height: 900, deviceScaleFactor: 1 },
        { width: 390, height: 844, deviceScaleFactor: 1 },
        { width: 360, height: 800, deviceScaleFactor: 1 },
        // 200%: a 1280x900 window at double zoom lays out at 640x450 CSS pixels.
        { width: 640, height: 450, deviceScaleFactor: 2 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: size.deviceScaleFactor,
          storageState: state,
        })
        await context.addInitScript((t) => localStorage.setItem('lorevolve-theme', t), theme)
        const sized = await context.newPage()
        const where = `${theme} ${size.width}@${size.deviceScaleFactor}x`

        await sized.goto(`/app/universes/${universeId}/trash`)
        await expect(sized.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(sized.getByTestId('trash-list').locator('li'), where).toHaveCount(12)
        await sized.getByTestId('trash-select').click()
        await sized.getByTestId('trash-select-page').click()
        await expect(selectedCount(sized)).toHaveText('12 selected')

        // The name keeps its own direction inside the row.
        await expect(row(sized, rtlName).locator('.trash__name bdi')).toHaveText(rtlName)

        // Every checkbox is on screen and big enough to hit; its row, the label, is the larger target.
        for (const box of await sized.getByRole('checkbox').all()) {
          await box.scrollIntoViewIfNeeded()
          const rect = (await box.boundingBox())!
          expect(rect.width, where).toBeGreaterThanOrEqual(18)
          expect(rect.x + rect.width, where).toBeLessThanOrEqual(size.width)
          expect(rect.x, where).toBeGreaterThanOrEqual(0)
        }
        const label = (await row(sized, rtlName).locator('.trash__pick').boundingBox())!
        expect(label.height, where).toBeGreaterThanOrEqual(40)

        // The bar's controls all fit, the red one included.
        for (const id of [
          'trash-bulk-delete',
          'trash-select-page',
          'trash-clear-selection',
          'trash-select-done',
        ]) {
          const rect = (await sized.getByTestId(id).boundingBox())!
          expect(rect.x, `${where} ${id}`).toBeGreaterThanOrEqual(0)
          expect(rect.x + rect.width, `${where} ${id}`).toBeLessThanOrEqual(size.width)
        }
        await expect(bulkDelete(sized)).toHaveText('Delete permanently (12)')
        expect(await sideways(sized), where).toBeLessThanOrEqual(0)

        // The question, open, with all twelve: names wrap and isolated, both buttons reachable and inside.
        await bulkDelete(sized).click()
        const panel = confirmPanel(sized)
        await expect(panel).toBeFocused()
        await expect(panel.locator('.trash__bulklist bdi', { hasText: rtlName })).toHaveCount(1)
        await expect(panel.locator('.trash__bulklist bdi', { hasText: longName })).toHaveCount(1)
        for (const id of ['trash-bulk-delete-confirm', 'trash-bulk-cancel']) {
          const button = panel.getByTestId(id)
          await button.scrollIntoViewIfNeeded()
          await expect(button).toBeInViewport()
          const rect = (await button.boundingBox())!
          expect(rect.x, `${where} ${id}`).toBeGreaterThanOrEqual(0)
          expect(rect.x + rect.width, `${where} ${id}`).toBeLessThanOrEqual(size.width)
        }
        expect(await sideways(sized), where).toBeLessThanOrEqual(0)
        await panel.getByTestId('trash-bulk-cancel').click()
        await expect(bulkDelete(sized)).toBeFocused()

        await context.close()
      }
    }
  })
})

import { expect, test, type Browser, type BrowserContext } from '@playwright/test'
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
  type Kind,
} from './support/trash'

/**
 * Product refinement 021. Every row in the Trash can be deleted permanently: a quiet second action after Restore that asks
 * first, in the row, naming the kind and the name, what goes with it and that it cannot be undone. The graph that goes is
 * proved by the API tests; this file proves what only a browser can - the question, the focus, the list telling the truth
 * afterwards, and a row that still reads as a recovery surface at every width, in both themes.
 */

test.describe('deleting from the Trash permanently', () => {
  test('every kind offers it; one click only asks; Cancel keeps the row; confirming erases it for good', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const names = await everyKind(page, universeId)

    await page.goto(`/app/universes/${universeId}/trash`)
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(7)

    // The lede still says the Trash is recoverable, and says the one way it stops being.
    await expect(page.getByText('until you choose to delete it permanently')).toBeVisible()

    // Every kind has the action, named in words with its kind and name.
    const kinds: Record<Kind, string> = {
      entry: 'entry',
      story: 'story',
      chapter: 'chapter',
      scene: 'scene',
      arc: 'arc',
      beat: 'beat',
      rule: 'world rule',
    }
    for (const kind of Object.keys(names) as Kind[]) {
      await expect(
        row(page, names[kind]).getByRole('button', {
          name: `Delete permanently: ${kinds[kind]} “${names[kind]}”`,
        }),
      ).toBeVisible()
    }

    // One click asks, and deletes nothing.
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE') requests.push(request.url())
    })
    const eldric = row(page, names.entry)
    await eldric.getByTestId(`erase-${names.entry}`).click()
    const confirm = eldric.getByTestId('trash-erase-confirm')
    await expect(confirm).toBeFocused()
    await expect(confirm).toHaveAccessibleName('Permanently delete the entry “King Eldric”?')
    await expect(confirm.getByTestId('trash-erase-text')).toContainText(
      'links and references to it',
    )
    await expect(confirm.getByTestId('trash-erase-text')).toContainText('This cannot be undone.')
    await expect(
      confirm.getByRole('button', { name: 'Delete permanently', exact: true }),
    ).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Move to Trash' })).toHaveCount(0)
    expect(requests).toEqual([])

    // Restore cannot race it from the same row, nor can another row start.
    await expect(eldric.getByTestId(`restore-${names.entry}`)).toBeDisabled()
    await expect(row(page, names.rule).getByTestId(`erase-${names.rule}`)).toBeDisabled()

    // Cancel keeps the row and hands the focus back to what asked.
    await confirm.getByTestId('trash-erase-cancel').click()
    await expect(confirm).toHaveCount(0)
    await expect(eldric.getByTestId(`erase-${names.entry}`)).toBeFocused()
    expect(await trashCount(page, universeId)).toBe(7)

    // Kind by kind, the copy says what goes - and a chapter never says its scenes do.
    const says: Array<[Kind, string]> = [
      ['story', 'its chapters, its scenes'],
      ['chapter', 'moved to Unchaptered'],
      ['scene', 'Its writing and every saved version'],
      ['arc', 'Every beat in it goes with it'],
      ['beat', 'Its links to scenes'],
      ['rule', 'Its check goes with it'],
    ]
    for (const [kind, text] of says) {
      const it = row(page, names[kind])
      await it.getByTestId(`erase-${names[kind]}`).click()
      await expect(it.getByTestId('trash-erase-text')).toContainText(text)
      await expect(it.getByTestId('trash-erase-text')).toContainText('This cannot be undone.')
      await it.getByTestId('trash-erase-confirm').press('Escape')
      await expect(it.getByTestId('trash-erase-confirm')).toHaveCount(0)
    }

    // Confirming: once, however eager the click.
    await eldric.getByTestId(`erase-${names.entry}`).click()
    await eldric.getByTestId('trash-erase-delete').dblclick()
    await expect(row(page, names.entry)).toHaveCount(0)
    await expect(page.getByTestId('trash-message')).toHaveText(
      '“King Eldric” was permanently deleted.',
    )
    await expect(page.locator('.trash__outcome')).toBeFocused()
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(6)
    expect(requests.filter((url) => url.includes('/trash/'))).toHaveLength(1)

    // It does not come back.
    await page.reload()
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(6)
    await expect(row(page, names.entry)).toHaveCount(0)
    expect(await trashCount(page, universeId)).toBe(6)
  })

  test('Restore is unchanged, and a row that must wait to be restored can still be deleted', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)
    const saga = await seed.story('Waiting Saga')
    const arc = await saga.arc('Waiting Arc')
    const beat = await arc.beat('Waiting Beat')
    await beat.bin()
    await arc.bin()

    await page.goto(`/app/universes/${universeId}/trash`)
    const waiting = row(page, 'Waiting Beat')
    await expect(waiting.getByTestId('restore-Waiting Beat')).toBeDisabled()
    await expect(waiting.getByTestId('erase-Waiting Beat')).toBeEnabled()

    await waiting.getByTestId('erase-Waiting Beat').click()
    await waiting.getByTestId('trash-erase-delete').click()
    await expect(page.getByTestId('trash-message')).toHaveText(
      '“Waiting Beat” was permanently deleted.',
    )
    await expect(row(page, 'Waiting Beat')).toHaveCount(0)

    // The arc is still in the Trash and restores exactly as before.
    await row(page, 'Waiting Arc').getByTestId('restore-Waiting Arc').click()
    await expect(page.getByTestId('trash-message')).toContainText('is back in')
    await expect(page.getByTestId('trash-open')).toBeVisible()
    await expect(page.getByTestId('trash-empty')).toBeVisible()
  })

  test('deleting a story or an arc takes its own rows in the Trash with it', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)

    const doomed = await seed.story('Doomed Saga')
    const scene = await doomed.scene('Scene of the Doomed Saga')
    await scene.bin()
    await doomed.bin()

    const saga = await seed.story('Standing Saga')
    const arc = await saga.arc('Doomed Arc')
    const beat = await arc.beat('Beat of the Doomed Arc')
    await beat.bin()
    await arc.bin()

    await page.goto(`/app/universes/${universeId}/trash`)
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(4)

    const story = row(page, 'Doomed Saga')
    await story.getByTestId('erase-Doomed Saga').click()
    await expect(story.getByTestId('trash-erase-text')).toContainText(
      'including any of them that are in the Trash on their own',
    )
    await story.getByTestId('trash-erase-delete').click()
    await expect(row(page, 'Doomed Saga')).toHaveCount(0)
    await expect(row(page, 'Scene of the Doomed Saga')).toHaveCount(0)

    const arcRow = row(page, 'Doomed Arc')
    await arcRow.getByTestId('erase-Doomed Arc').click()
    await arcRow.getByTestId('trash-erase-delete').click()
    await expect(row(page, 'Doomed Arc')).toHaveCount(0)
    await expect(row(page, 'Beat of the Doomed Arc')).toHaveCount(0)
    await expect(page.getByTestId('trash-empty')).toBeVisible()

    // The story it was in stands.
    const stories = await (await page.request.get(`/api/universes/${universeId}/stories`)).text()
    expect(stories).toContain('Standing Saga')
  })

  test('a failed delete keeps the row and says so, in words', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    const entry = await seeder(page, universeId).entry('Stubborn Relic')
    await entry.bin()

    await page.route('**/api/universes/*/trash/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      await route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          title: 'SqliteException: database is locked',
          status: 500,
        }),
      })
    })

    await page.goto(`/app/universes/${universeId}/trash`)
    const relic = row(page, 'Stubborn Relic')
    await relic.getByTestId('erase-Stubborn Relic').click()
    await relic.getByTestId('trash-erase-delete').click()

    const error = relic.getByTestId('trash-erase-error')
    await expect(error).toHaveText('“Stubborn Relic” could not be deleted just now. Try again.')
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(page.getByText('Sqlite')).toHaveCount(0)
    await expect(page.getByTestId('trash-message')).toHaveCount(0)
    await expect(relic.getByTestId('trash-erase-delete')).toHaveText('Delete permanently')

    await page.unroute('**/api/universes/*/trash/*')
    await relic.getByTestId('trash-erase-cancel').click()
    await page.reload()
    await expect(row(page, 'Stubborn Relic')).toBeVisible()
    expect(await trashCount(page, universeId)).toBe(1)
  })

  test('the last row of the last page steps back a page; the keyboard does all of it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)
    for (let index = 1; index <= 13; index += 1) {
      const entry = await seed.entry(`Relic ${String(index).padStart(2, '0')}`)
      await entry.bin()
    }

    await page.goto(`/app/universes/${universeId}/trash`)
    await expect(page.locator('.pager__position')).toHaveText('Page 1 of 2')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(1)

    // Keyboard only: to the action, open, to the final button, confirm.
    const last = page.getByTestId('trash-list').locator('li').first()
    const name = (await last.getAttribute('data-testid'))!.replace('trash-row-', '')
    await last.getByTestId(`restore-${name}`).focus()
    await page.keyboard.press('Tab')
    await expect(last.getByTestId(`erase-${name}`)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(last.getByTestId('trash-erase-confirm')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(last.getByTestId('trash-erase-delete')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('trash-message')).toHaveText(`“${name}” was permanently deleted.`)
    await expect(page.getByTestId('trash-list').locator('li')).toHaveCount(12)
    await expect(page.locator('.pager')).toHaveCount(0)
    await expect(page.locator('.trash__outcome')).toBeFocused()
  })

  test("a story erased lets go of exactly its scenes' recovery copies, only once the server has erased it", async ({
    page,
  }) => {
    await signUp(page)
    const accountId = ((await (await page.request.get('/api/auth/me')).json()) as { id: string }).id
    const universeId = await world(page)
    const seed = seeder(page, universeId)

    const doomed = await seed.story('Doomed Chronicle')
    const sceneA = await doomed.scene('Scene A')
    const sceneB = await doomed.scene('Scene B')
    const standing = await seed.story('Standing Chronicle')
    const sceneC = await standing.scene('Scene C')
    const entry = await seed.entry('Unrelated Entry')
    const ideaId = 'e7a1d0c5-0000-4000-8000-000000000001'
    await doomed.bin()

    await page.goto(`/app/universes/${universeId}/trash`)
    await keepCopies(page, accountId, [
      { universeId, kind: 'manuscript', contentId: sceneA.id },
      { universeId, kind: 'manuscript', contentId: sceneB.id },
      { universeId, kind: 'manuscript', contentId: sceneC.id },
      { universeId, kind: 'article', contentId: entry.id },
      { universeId: null, kind: 'idea', contentId: ideaId },
    ])
    const everyCopy = [sceneA.id, sceneB.id, sceneC.id, entry.id, ideaId].sort()
    expect(await heldCopies(page)).toEqual(everyCopy)

    // Asking and cancelling lets nothing go.
    const story = row(page, 'Doomed Chronicle')
    await story.getByTestId('erase-Doomed Chronicle').click()
    await story.getByTestId('trash-erase-cancel').click()
    expect(await heldCopies(page)).toEqual(everyCopy)

    // A delete the server refuses lets nothing go either: the story is still in the Trash, its writing still held here.
    await page.route('**/api/universes/*/trash/stories/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 500,
            contentType: 'application/problem+json',
            body: '{"status":500}',
          })
        : route.fallback(),
    )
    await story.getByTestId('erase-Doomed Chronicle').click()
    await story.getByTestId('trash-erase-delete').click()
    await expect(story.getByTestId('trash-erase-error')).toBeVisible()
    expect(await heldCopies(page)).toEqual(everyCopy)
    expect(await trashCount(page, universeId)).toBe(1)
    await page.unroute('**/api/universes/*/trash/stories/*')

    // Erased: its two scenes' copies go; another story's scene, the article and the idea stay.
    await story.getByTestId('trash-erase-delete').click()
    await expect(page.getByTestId('trash-message')).toHaveText(
      '“Doomed Chronicle” was permanently deleted.',
    )
    await expect.poll(() => heldCopies(page)).toEqual([sceneC.id, entry.id, ideaId].sort())

    // One scene erased on its own lets go of its own copy, and nothing else.
    await sceneC.bin()
    await page.reload()
    const lone = row(page, 'Scene C')
    await lone.getByTestId('erase-Scene C').click()
    await lone.getByTestId('trash-erase-delete').click()
    await expect(page.getByTestId('trash-message')).toHaveText('“Scene C” was permanently deleted.')
    await expect.poll(() => heldCopies(page)).toEqual([entry.id, ideaId].sort())
  })

  test('the row reads as a recovery list at every width, in both themes and at 200%, names isolated', async ({
    browser,
  }) => {
    // Fourteen fresh contexts (two themes x seven sizes), each loading the Trash: ~24 s here, most of Playwright's default
    // 30 s. CI ran out of it on all three attempts (Deploy DEV, 2026-10-24 and -25) and the row was never late, only the
    // clock. The loop is the test; its budget says so, as final-polish.spec.ts does for the same loop.
    test.setTimeout(120_000)
    const setup = await browser.newContext()
    const page = await setup.newPage()
    await signUp(page)
    const universeId = await world(page)
    const seed = seeder(page, universeId)
    const rtl = await seed.entry('עידן האור הגדול והארוך מאוד')
    await rtl.bin()
    const long = await seed.story(
      'The Exceedingly Long and Winding Chronicle of the Seven Drowned Crowns of Vael',
    )
    await long.bin()
    const state = await setup.storageState()
    await setup.close()

    await checkEverySize(browser, state, universeId)
  })
})

async function checkEverySize(
  browser: Browser,
  state: Awaited<ReturnType<BrowserContext['storageState']>>,
  universeId: string,
) {
  for (const theme of ['light', 'dark']) {
    for (const size of [
      { width: 1920, height: 1080, deviceScaleFactor: 1 },
      { width: 1440, height: 900, deviceScaleFactor: 1 },
      { width: 1024, height: 768, deviceScaleFactor: 1 },
      { width: 820, height: 1180, deviceScaleFactor: 1 },
      { width: 390, height: 844, deviceScaleFactor: 1 },
      { width: 360, height: 800, deviceScaleFactor: 1 },
      { width: 640, height: 450, deviceScaleFactor: 2 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.deviceScaleFactor,
        storageState: state,
      })
      await context.addInitScript((t) => localStorage.setItem('lorex-theme', t), theme)
      const page = await context.newPage()
      const where = `${theme} ${size.width}@${size.deviceScaleFactor}x`

      await page.goto(`/app/universes/${universeId}/trash`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const hebrew = row(page, 'עידן האור הגדול והארוך מאוד')
      await expect(hebrew).toBeVisible()

      // The authored name is isolated, so the row's own words keep their order.
      await expect(hebrew.locator('.trash__name bdi')).toHaveText('עידן האור הגדול והארוך מאוד')

      // Restore is the button; Delete permanently is quiet text, not a second red button.
      const erase = hebrew.getByTestId('erase-עידן האור הגדול והארוך מאוד')
      const restore = hebrew.getByTestId('restore-עידן האור הגדול והארוך מאוד')
      const [eraseLook, restoreLook, danger] = await Promise.all([
        erase.evaluate((node) => getComputedStyle(node).backgroundColor),
        restore.evaluate((node) => getComputedStyle(node).borderTopColor),
        page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--danger').trim()),
      ])
      expect(eraseLook, where).toBe('rgba(0, 0, 0, 0)')
      expect(restoreLook, where).not.toBe('rgba(0, 0, 0, 0)')
      expect(danger.length, where).toBeGreaterThan(0)

      for (const control of [restore, erase]) {
        const box = await control.boundingBox()
        expect(box!.x + box!.width, where).toBeLessThanOrEqual(size.width)
      }
      expect(await sideways(page), where).toBeLessThanOrEqual(0)

      // The question, open, fits too, and its final button is inside the viewport.
      await erase.click()
      const confirm = hebrew.getByTestId('trash-erase-confirm')
      await expect(confirm).toBeFocused()
      await expect(confirm.locator('.trash__confirmtitle bdi')).toHaveText(
        'עידן האור הגדול והארוך מאוד',
      )
      const final = await confirm.getByTestId('trash-erase-delete').boundingBox()
      expect(final!.x + final!.width, where).toBeLessThanOrEqual(size.width)
      expect(await sideways(page), where).toBeLessThanOrEqual(0)
      await confirm.getByTestId('trash-erase-cancel').click()

      await context.close()
    }
  }
}

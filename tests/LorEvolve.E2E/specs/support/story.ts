import { expect, type Page } from '@playwright/test'

const folded =
  '[data-testid="arc-toggle"][aria-expanded="false"], [data-testid="chapter-toggle"][aria-expanded="false"], [data-testid="scene-toggle"][aria-expanded="false"]'

/**
 * Arcs, chapters and scenes start folded; this opens every one on the story page. It repeats until a fold is not
 * found twice in a row: the page stands while another view is up and fetches the story again as Scenes arrives, which
 * folds everything anew, so one clean pass is not proof.
 */
export async function expandStory(page: Page) {
  await expect(page.getByTestId('story-page')).toBeVisible()
  const toggles = page.locator(folded)
  for (let quiet = 0, guard = 0; quiet < 2 && guard < 100; guard++) {
    const count = await toggles.count()
    if (count === 0) {
      quiet++
      await page.waitForTimeout(150)
      continue
    }
    quiet = 0
    for (let index = 0; index < count; index++) await toggles.first().click()
  }
}

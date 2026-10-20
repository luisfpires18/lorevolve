import { expect, type Page } from '@playwright/test'

/**
 * A Family Tree member's details (Issue #37). A node shows only a portrait and a name; what it used to carry in words -
 * every position, the links behind it, the type, the status, authored family - is in the details its eye opens.
 *
 * Not a spec.
 */

/** Opens a member's details from the eye on its node, and hands back the dialog. */
export async function openDetails(page: Page, name: string) {
  await page.getByTestId(`family-details-${name}`).click()
  const details = page.getByTestId('family-details')
  await expect(details).toBeVisible()
  return details
}

/** Opens a member's details, checks that each text is in them, and closes them again with Escape. */
export async function expectDetails(page: Page, name: string, ...texts: string[]) {
  const details = await openDetails(page, name)
  for (const text of texts) {
    await expect(details).toContainText(text)
  }
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
}

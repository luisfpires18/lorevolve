import { expect, type Page } from '@playwright/test'

/**
 * Lore starts with no type chosen (Product refinement 022): nothing is listed until one is. Chooses a type the way an
 * author does - from Lore's front page, the card of the top-level category (Issue #60); from a type's list, the type
 * navigation: on a desktop the category row and, beneath it, the row of what is inside the chosen category; on a phone
 * the Category menu and the menu under it (refinement 028) - walking the path given from its top-level category down,
 * and waits for the last one's page.
 */
export async function chooseLoreType(page: Page, ...path: string[]) {
  const nav = page.getByRole('navigation', { name: 'Lore types' })
  const catalog = page.getByTestId('lore-catalog')
  // Lore drawn first: the catalog, or a type's navigation in one of its two presentations.
  await expect(catalog.or(nav).or(page.getByTestId('lore-type-menu')).first()).toBeVisible()

  for (const [depth, name] of path.entries()) {
    if (depth === 0 && (await catalog.isVisible())) {
      await catalog.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`).click()
    } else if (await nav.isVisible()) {
      const row =
        depth === 0
          ? nav.getByTestId('lore-categories')
          : nav.locator(`[data-testid="lore-subtypes"][data-parent-name="${path[depth - 1]}"]`)
      await row.locator(`[data-testid="lore-type"][data-type-name="${name}"]`).click()
    } else {
      const menu =
        depth === 0
          ? page.getByTestId('lore-type-menu')
          : page.getByTestId('lore-subtype-menu').nth(depth - 1)
      await menu.click()
      await page
        .getByTestId(depth === 0 ? 'lore-type-menu-panel' : 'lore-subtype-menu-panel')
        .locator(`[data-type-name="${name}"]`)
        .last()
        .click()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  }
  await expect(page).toHaveURL(/[?&]type=/)
}

/**
 * The catalog shows top-level types first; each type that holds others folds them away behind Show nested types. Opens
 * every fold, deepest last, so every type is a card.
 */
export async function expandAllTypes(page: Page) {
  const closed = page.locator('[data-testid="lore-type-expand"][aria-expanded="false"]')
  await expect(page.getByTestId('lore-type-cards')).toBeVisible()
  while ((await closed.count()) > 0) {
    const name = await closed.first().getAttribute('data-type-name')
    const fold = page.locator(`[data-testid="lore-type-expand"][data-type-name="${name}"]`)
    await fold.click()
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
  }
}

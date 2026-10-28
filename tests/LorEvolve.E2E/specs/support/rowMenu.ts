import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The Story workspace's secondary verbs live in each row's ⋯ menu: a scene's Edit, moves and Delete, a chapter's, an
 * arc's and a beat's, the story's own Edit and Delete, and the open manuscript's Edit scene and Show in Scenes. These
 * helpers open the right menu for the item a spec names, so a spec says what it does rather than where it lives.
 *
 * Not a spec.
 */
const MENUS: [RegExp, string][] = [
  [/^scene-/, 'scene-actions'],
  [/^chapter-/, 'chapter-actions'],
  [/^plot-arc-/, 'plot-arc-actions'],
  [/^plot-beat-/, 'plot-beat-actions'],
  [/^(edit|delete)-story$/, 'story-actions'],
  [/^manuscript-(edit|show)-scene$/, 'manuscript-scene-actions'],
]

/** The ⋯ trigger that holds `item`. */
export function menuTrigger(scope: Locator | Page, item: string) {
  const menu = MENUS.find(([pattern]) => pattern.test(item))?.[1]
  if (!menu) throw new Error(`No row menu holds ${item}`)
  return scope.getByTestId(menu).first()
}

/** Opens the menu that holds `item` inside `scope` and waits for the item. */
export async function openMenuFor(scope: Locator | Page, item: string) {
  const trigger = menuTrigger(scope, item)
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(scope.getByTestId(item).first()).toBeVisible()
}

/** Opens the menu that holds `item` inside `scope` and presses it. */
export async function chooseFromMenu(scope: Locator | Page, item: string) {
  await openMenuFor(scope, item)
  await scope.getByTestId(item).first().click()
}

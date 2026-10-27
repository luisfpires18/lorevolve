import { expect, type Page } from '@playwright/test'

/**
 * LorEvolve's own confirmation (Issue #50), which replaced the browser's `confirm()`: one dialog at a time, its question in
 * its title and body, a confirm button that names the action, and Cancel. Only `beforeunload` - a reload or a closed tab
 * - is still the browser's own prompt.
 */
export function confirmDialog(page: Page) {
  return page.getByTestId('confirm-dialog')
}

/** Waits for the confirmation, checks it says `text` if given, and confirms it. */
export async function acceptConfirm(page: Page, text?: string | RegExp) {
  const dialog = confirmDialog(page)
  await expect(dialog).toBeVisible()
  if (text !== undefined) await expect(dialog).toContainText(text)
  await dialog.getByTestId('confirm-dialog-confirm').click()
}

/**
 * Answers every LorEvolve confirmation from now on - confirms it when `decide()` says true, cancels it otherwise - and then
 * adds what it asked, its title then its message, to `asked`: what a `page.on('dialog')` handler did for the browser's
 * own. A question is in `asked` only once it has been answered, so `expect.poll(() => asked)` waits for both. The page
 * watches for the dialog itself, so it is answered however the test is waiting. Once per page.
 */
export async function answerConfirms(page: Page, decide: () => boolean, asked: string[]) {
  await page.exposeBinding('__lorevolveDecideConfirm', () => (decide() ? 'leave' : 'stay'))
  await page.exposeBinding('__lorevolveConfirmAnswered', (_source, said: string) => {
    asked.push(said)
  })
  const watch = () => {
    const seen = new WeakSet<Element>()
    const lorevolve = window as unknown as {
      __lorevolveDecideConfirm: () => Promise<string>
      __lorevolveConfirmAnswered: (said: string) => Promise<void>
    }
    new MutationObserver(() => {
      const dialog = document.querySelector<HTMLDialogElement>('[data-testid="confirm-dialog"]')
      if (!dialog || !dialog.open || seen.has(dialog)) return
      seen.add(dialog)
      const title = dialog.querySelector('.confirm__title')?.textContent ?? ''
      const message = dialog.querySelector('.confirm__message')?.textContent
      void lorevolve.__lorevolveDecideConfirm().then((answer) => {
        const button = answer === 'leave' ? 'confirm-dialog-confirm' : 'confirm-dialog-cancel'
        dialog.querySelector<HTMLButtonElement>(`[data-testid="${button}"]`)?.click()
        void lorevolve.__lorevolveConfirmAnswered(message ? `${title} ${message}` : title)
      })
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    })
  }
  await page.addInitScript(watch)
  await page.evaluate(watch)
}

/** Waits for the confirmation, checks it says `text` if given, and cancels it: nothing it asked about happens. */
export async function dismissConfirm(page: Page, text?: string | RegExp) {
  const dialog = confirmDialog(page)
  await expect(dialog).toBeVisible()
  if (text !== undefined) await expect(dialog).toContainText(text)
  await dialog.getByTestId('confirm-dialog-cancel').click()
  await expect(dialog).toHaveCount(0)
}

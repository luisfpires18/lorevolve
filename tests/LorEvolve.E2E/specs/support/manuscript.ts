import { expect, type Locator } from '@playwright/test'

/**
 * The text a scene's Write editor holds, as it is stored (ADR 0058 amendment): a line per paragraph, each mention chip as
 * `@[Name](lore:<id>)`. Read from the editor's own DOM, the way `manuscriptText` reads its document.
 */
export function writtenText(editor: Locator) {
  return editor.evaluate((root) =>
    Array.from(root.children, (line) =>
      Array.from(line.childNodes, (node) =>
        node instanceof HTMLElement
          ? node.dataset.mention
            ? `@[${node.textContent}](lore:${node.dataset.mention})`
            : ''
          : (node.textContent ?? ''),
      ).join(''),
    ).join('\n'),
  )
}

/** Waits until the Write editor holds exactly `text`, as `toHaveValue` did for the text box. */
export async function expectWritten(editor: Locator, text: string) {
  await expect.poll(() => writtenText(editor)).toBe(text)
}

/** The editor instance Tiptap hangs on its own element, as much of it as these helpers use. */
type EditorElement = HTMLElement & {
  editor: {
    state: {
      selection: { from: number; to: number }
      doc: {
        content: { size: number }
        textBetween: (from: number, to: number, block: string) => string
      }
    }
    commands: { setTextSelection: (range: { from: number; to: number }) => boolean }
  }
}

/** The editor's selection as offsets into its text, the way `selectionStart` and `selectionEnd` give a text box's. */
export function writtenSelection(editor: Locator) {
  return editor.evaluate((root) => {
    const { state } = (root as EditorElement).editor
    const offset = (position: number) => state.doc.textBetween(0, position, '\n').length
    return [offset(state.selection.from), offset(state.selection.to)]
  })
}

/** Selects text by offsets into the editor's text, as `setSelectionRange` did. For prose with no mention in it. */
export function selectWritten(editor: Locator, start: number, end: number) {
  return editor.evaluate(
    (root, [from, to]) => {
      const { state, commands } = (root as EditorElement).editor
      const text = state.doc.textBetween(0, state.doc.content.size, '\n')
      // Each line is a paragraph: one position to open the first, and one more for every line break before the offset.
      const position = (offset: number) =>
        offset + 1 + (text.slice(0, offset).match(/\n/g)?.length ?? 0)
      commands.setTextSelection({ from: position(from), to: position(to) })
    },
    [start, end],
  )
}

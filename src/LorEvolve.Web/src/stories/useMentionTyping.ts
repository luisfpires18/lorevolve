import type { Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { t } from '../i18n'
import { mentionName, mentionQueryAt } from '../lore/mentions'
import type { EntitySummary } from '../lore/types'
import type { Dispatch, RefObject, SetStateAction } from 'react'

/** What a chip counts as where the editor reads its text: one character that is neither a space nor part of a name. */
const CHIP = '\ufffc'

/** The @ mention being typed: where its `@` is in the document, the words after it, and where to draw the suggestions. */
export type Mention = {
  start: number
  query: string
  top: number
  left: number
}

/** Follows the caret for an `@` mention and puts the chosen entry in its place. */
export function useMentionTyping({
  frame,
  mention,
  setMention,
  setActiveSuggestion,
  dismissed,
  onAnnounce,
}: {
  frame: RefObject<HTMLDivElement | null>
  mention: Mention | null
  setMention: Dispatch<SetStateAction<Mention | null>>
  setActiveSuggestion: Dispatch<SetStateAction<number>>
  dismissed: RefObject<number | null>
  onAnnounce: (message: string) => void
}) {
  /**
   * Opens, moves or closes the suggestions to match the caret: open while the caret ends an `@query` that could start a
   * mention, closed for a selection, an email address, or an `@` closed with Escape. Reads only the end of the caret's
   * line, so the length of the scene costs nothing here.
   */
  function trackMention(current: Editor) {
    const { selection } = current.state
    const $caret = selection.$from
    const from = Math.max(0, $caret.parentOffset - 42)
    const before = $caret.parent.textBetween(from, $caret.parentOffset, undefined, CHIP)
    const found =
      current.isEditable && selection.empty ? mentionQueryAt(before, before.length) : null
    const start = found ? $caret.start() + from + found.start : null
    if (found === null || start === null || start === dismissed.current) {
      if (found === null) dismissed.current = null
      setMention(null)
      return
    }
    const box = frame.current?.getBoundingClientRect()
    const point = current.view.coordsAtPos(start)
    const width = frame.current?.clientWidth ?? 0
    setMention((open) => {
      if (open === null || open.start !== start) setActiveSuggestion(0)
      return {
        start,
        query: found.query,
        top: point.bottom - (box?.top ?? 0) + 4,
        left: Math.max(0, Math.min(point.left - (box?.left ?? 0), width - 288)),
      }
    })
  }

  /** Puts the chosen entry in place of the `@query` as one mention: one step of undo, unsaved until Save. */
  function chooseMention(current: Editor, row: EntitySummary) {
    if (mention === null) return
    const $caret = current.state.selection.$from
    const next = $caret.parent.textBetween(
      $caret.parentOffset,
      Math.min($caret.parentOffset + 1, $caret.parent.content.size),
      undefined,
      CHIP,
    )
    current
      .chain()
      .focus()
      // Its own step of undo, never folded into the typing just before it.
      .command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      .insertContentAt({ from: mention.start, to: $caret.pos }, [
        { type: 'mention', attrs: { id: row.id, name: mentionName(row.name) } },
        ...(next === '' || /\S/.test(next) ? [{ type: 'text', text: ' ' }] : []),
      ])
      .run()
    dismissed.current = null
    setMention(null)
    onAnnounce(t('manuscript.writer.mentioned', { name: row.name }))
  }
  return { trackMention, chooseMention }
}

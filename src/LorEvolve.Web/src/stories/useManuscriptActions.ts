import { closeHistory } from '@tiptap/pm/history'
import { t, tn } from '../i18n'
import { manuscriptDoc } from '../lore/mentions'
import type { SceneManuscript } from './types'
import { storedOf, type useManuscriptState } from './useManuscriptState'

/** What the editor's buttons do: link names, read again, keep or take the latest, recover or discard the copy. */
export function useManuscriptActions({
  discard,
  settle,
  setLoad,
  setReads,
  setStored,
  setDraft,
  setFailure,
  setConflict,
  setHistoryKey,
  setIsLinking,
  setAnnouncement,
  editor,
  focusEditor,
  offer,
}: ReturnType<typeof useManuscriptState> & {
  offer: NonNullable<ReturnType<typeof useManuscriptState>['found']> | null
}) {
  /** The names the author confirmed, made mentions as one edit: one undo step, unsaved until Save. */
  function linkFromLore(next: string, count: number) {
    setIsLinking(false)
    if (!editor.current) return
    editor.current
      .chain()
      .command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      .setContent(manuscriptDoc(next))
      .run()
    focusEditor()
    setAnnouncement(tn('manuscript.editor.linked', count, { n: count }))
  }

  function reread() {
    setConflict(false)
    setFailure(null)
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  /**
   * The author has seen the latest prose and keeps their own: it stays in the box, still unsaved, now measured against the
   * latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: SceneManuscript) {
    setStored(storedOf(latest))
    setConflict(false)
    setHistoryKey((key) => key + 1)
    setAnnouncement(t('manuscript.editor.keptMine'))
    requestAnimationFrame(() => editor.current?.commands.focus())
  }

  /** Lets this window's unsaved prose go for the latest. The conflict notice has already asked. */
  function takeLatest() {
    discard()
    reread()
  }

  /** Puts the recovery copy in the box as unsaved writing. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    setDraft(offer.content)
    setAnnouncement(t('manuscript.editor.recovered'))
    requestAnimationFrame(() => editor.current?.commands.focus())
  }

  function discardDraft() {
    discard()
    setAnnouncement(t('manuscript.editor.discarded'))
    requestAnimationFrame(() => editor.current?.commands.focus())
  }
  return { linkFromLore, reread, keepMine, takeLatest, recoverDraft, discardDraft }
}

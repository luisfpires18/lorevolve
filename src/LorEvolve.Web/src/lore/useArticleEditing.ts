import type { EntityArticle } from './article'
import { confirmDiscard } from '../lib/confirm'
import { useI18n } from '../i18n'
import type { EntityArticleSectionProps } from '../components/EntityArticle'
import { storedOf, type useEntityArticle } from './useEntityArticle'

/** Opening and closing the writing, reading the article again, and the answers to a conflict and a recovery copy. */
export function useArticleEditing({
  discard,
  settle,
  setLoad,
  setReads,
  setStored,
  setIsEditing,
  setEditorKey,
  setOpeningWith,
  setDraft,
  setBaseline,
  setFailure,
  setConflict,
  setHistoryKey,
  setAnnouncement,
  startButton,
  editor,
  isDirty,
  offer,
  onSaved,
}: ReturnType<typeof useEntityArticle> & Pick<EntityArticleSectionProps, 'onSaved'>) {
  const { t } = useI18n()

  /** Opens the writing on the saved article - or, when recovering, on the recovery copy, unsaved against it. */
  function startEditing(recovered: string | null = null) {
    setFailure(null)
    setConflict(false)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(recovered)
    setEditorKey((key) => key + 1)
    setIsEditing(true)
  }

  async function finishEditing() {
    if (isDirty && !(await confirmDiscard(t('entity.article.discardConfirm')))) {
      return
    }

    // The author chose to let the unsaved text go, so its recovery copy goes with it.
    if (isDirty) discard()

    setIsEditing(false)
    setOpeningWith(null)
    setDraft(null)
    setBaseline(null)
    setFailure(null)
    setConflict(false)
    // Back to the control that opened the writing, so the keyboard carries on from where it started.
    requestAnimationFrame(() => startButton.current?.focus())
  }

  function reread() {
    setConflict(false)
    setFailure(null)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(null)
    setLoad({ kind: 'loading' })
    setEditorKey((key) => key + 1)
    setReads((current) => current + 1)
    setHistoryKey((key) => key + 1)
  }

  /**
   * The author has seen the latest article and keeps their own text: it stays in the editor, still unsaved, now measured
   * against the latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: EntityArticle) {
    setStored(storedOf(latest))
    setBaseline(latest.content)
    setConflict(false)
    setHistoryKey((key) => key + 1)
    if (latest.updatedAt) onSaved(latest.updatedAt)
    setAnnouncement(t('entity.article.announce.keptMine'))
    requestAnimationFrame(() => editor.current?.commands.focus())
  }

  /** Lets this window's unsaved text go for the latest article. The conflict notice has already asked. */
  function takeLatest() {
    discard()
    reread()
  }

  /** Puts the recovery copy in the editor as unsaved changes. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    startEditing(offer.content)
    setAnnouncement(t('entity.article.announce.recovered'))
  }

  function discardDraft() {
    discard()
    setAnnouncement(t('entity.article.announce.discarded'))
    requestAnimationFrame(() => startButton.current?.focus())
  }

  return { startEditing, finishEditing, reread, keepMine, takeLatest, recoverDraft, discardDraft }
}

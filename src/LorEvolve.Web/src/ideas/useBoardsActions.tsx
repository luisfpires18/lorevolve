import { Quoted } from '../components/NameList'
import { restoreIdeaBoard, type IdeaBoardSummary } from './boards'
import { t, type useI18n } from '../i18n'
import type { useBoardsState } from './useBoardsState'

/** The boards list's Restore, which says what it did. */
export function useBoardsActions({
  setRestoring,
  setOutcome,
  setReads,
  tx,
  basePath,
}: ReturnType<typeof useBoardsState> & { tx: ReturnType<typeof useI18n>['tx']; basePath: string }) {
  async function restore(board: IdeaBoardSummary) {
    setRestoring(board.id)
    setOutcome(null)
    try {
      const restored = await restoreIdeaBoard(board.id)
      setOutcome({
        text: tx('ideas.boards.restored', { title: <Quoted text={restored.title} /> }),
        link: { to: `${basePath}/${restored.id}`, label: t('ideas.boards.openIt') },
      })
    } catch {
      setOutcome({
        text: tx('ideas.boards.restoreFailed', { title: <Quoted text={board.title} /> }),
        link: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  return { restore }
}

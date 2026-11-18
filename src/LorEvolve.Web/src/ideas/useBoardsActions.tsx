import { useEffect } from 'react'
import { Quoted } from '../components/NameList'
import { restoreIdeaBoard, type IdeaBoardSummary } from './boards'
import type { useI18n } from '../i18n'
import type { useBoardsState } from './useBoardsState'

/** The boards list's outcome: focused when it is said, and Restore, which says it. */
export function useBoardsActions({
  outcome,
  outcomeRef,
  setRestoring,
  setOutcome,
  setReads,
  tx,
  basePath,
}: ReturnType<typeof useBoardsState> & { tx: ReturnType<typeof useI18n>['tx']; basePath: string }) {
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  async function restore(board: IdeaBoardSummary) {
    setRestoring(board.id)
    setOutcome(null)
    try {
      const restored = await restoreIdeaBoard(board.id)
      setOutcome({
        text: tx('ideas.boards.restored', { title: <Quoted text={restored.title} /> }),
        to: `${basePath}/${restored.id}`,
      })
    } catch {
      setOutcome({
        text: tx('ideas.boards.restoreFailed', { title: <Quoted text={board.title} /> }),
        to: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  return { restore }
}

import { useCallback } from 'react'
import { Quoted } from '../components/NameList'
import { restoreIdea } from './api'
import type { IdeaSummary } from './types'
import type { useI18n } from '../i18n'
import type { useIdeasState } from './useIdeasState'

/** An ideas list's Restore, which says what it did, and what a capture does to the list. */
export function useIdeasActions({
  setRestoring,
  setOutcome,
  setReads,
  tx,
  basePath,
  page,
  update,
}: ReturnType<typeof useIdeasState> & {
  tx: ReturnType<typeof useI18n>['tx']
  basePath: string
  page: number
  update: (change: Record<string, string | null>) => void
}) {
  async function restore(idea: IdeaSummary) {
    setRestoring(idea.id)
    setOutcome(null)
    try {
      const restored = await restoreIdea(idea.id)
      setOutcome({
        text: restored.universe
          ? tx('ideas.browser.restoredIn', {
              title: <Quoted text={restored.title} />,
              universe: <Quoted text={restored.universe.name} />,
            })
          : tx('ideas.browser.restored', { title: <Quoted text={restored.title} /> }),
        link: {
          to: `${basePath}/${restored.id}`,
          label: tx('ideas.browser.open', { title: <Quoted text={restored.title} /> }),
        },
      })
    } catch {
      setOutcome({
        text: tx('ideas.browser.restoreFailed', { title: <Quoted text={idea.title} /> }),
        link: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  /** A captured idea is the newest: shown at the top of the first page, which is read again. */
  const captured = useCallback(() => {
    setOutcome(null)
    if (page !== 1) update({ page: null })
    setReads((current) => current + 1)
  }, [page, update])

  return { restore, captured }
}

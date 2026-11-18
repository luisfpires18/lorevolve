import { useEffect } from 'react'
import { t } from '../i18n'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { Scene } from './types'
import type { useManuscriptState } from './useManuscriptState'

/** The recovery copy follows the writing, and leaving the page with unsaved writing asks first. */
export function useManuscriptRecovery({
  found,
  keep,
  forget,
  discard,
  stored,
  draft,
  isReady,
  isDirty,
  isHeld,
  scene,
}: ReturnType<typeof useManuscriptState> & {
  isReady: boolean
  isDirty: boolean
  isHeld: boolean
  scene: Scene
}) {
  // A copy identical to what is saved is nothing to recover: it goes without a word.
  useEffect(() => {
    if (isReady && found && found.content === stored.content) discard()
  }, [isReady, found, stored.content, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) {
      keep(draft, stored.updatedAt)
    } else {
      forget()
    }
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  useLeaveGuard(isDirty ? t('manuscript.editor.unsaved', { title: scene.title }) : null, discard)
}

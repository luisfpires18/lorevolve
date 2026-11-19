import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { formatDateTime } from '../../lib/dates'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'
import { DocumentHead } from '../DocumentHead'

/** A board editor's head: the way back, the heading with its actions menu, and the lede. */
export function BoardHead({
  listPath,
  listLabel,
  headingId,
  isNew,
  stored,
  isSaving,
  remove,
}: ReturnType<typeof useBoardState> & {
  listPath: string
  listLabel: ReactNode
  headingId: string
  remove: () => Promise<void>
}) {
  const { t, tx } = useI18n()
  return (
    <DocumentHead
      back={{ to: listPath, label: listLabel, testId: 'board-back' }}
      title={isNew ? t('ideas.board.newBoard') : <bdi>{stored.title}</bdi>}
      titleId={headingId}
      titleTestId="board-heading"
      actions={
        !isNew ? (
          <ActionMenu
            label={t('ideas.board.moreActions', { title: stored.title })}
            triggerTestId="board-actions"
          >
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={isSaving}
              onClick={() => void remove()}
              data-testid="board-delete"
            >
              <ActionIcon icon={Trash2} />
              {t('ideas.board.deleteBoard')}
            </button>
          </ActionMenu>
        ) : null
      }
      lede={
        <>
          {t('ideas.board.lede')}
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              {tx('ideas.board.lastSaved', {
                time: <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>,
              })}
            </>
          ) : null}
        </>
      }
    />
  )
}

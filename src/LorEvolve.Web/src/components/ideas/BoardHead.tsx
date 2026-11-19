import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { formatDateTime } from '../../lib/dates'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'

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
    <header className="idea__head">
      <Link className="idea__back" to={listPath} data-testid="board-back">
        {listLabel}
      </Link>
      <div className="doc__titlerow">
        <h1 className="idea__heading" id={headingId} data-testid="board-heading">
          {isNew ? t('ideas.board.newBoard') : <bdi>{stored.title}</bdi>}
        </h1>
        {!isNew ? (
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
        ) : null}
      </div>
      <QuietNote className="idea__lede">
        {t('ideas.board.lede')}
        {!isNew && stored.updatedAt ? (
          <>
            {' '}
            {tx('ideas.board.lastSaved', {
              time: <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>,
            })}
          </>
        ) : null}
      </QuietNote>
    </header>
  )
}

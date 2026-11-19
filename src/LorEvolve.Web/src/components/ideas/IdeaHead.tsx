import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { Quoted } from '../NameList'
import type { Stored } from '../../ideas/ideaDraft'
import { formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'

/** An idea editor's head: the way back, the heading with its actions menu, the lede, and where the idea belongs. */
export function IdeaHead({
  listPath,
  listLabel,
  headingId,
  isNew,
  stored,
  isSaving,
  remove,
  contextUniverse,
  ideaId,
}: {
  listPath: string
  listLabel: ReactNode
  headingId: string
  isNew: boolean
  stored: Stored
  isSaving: boolean
  remove: () => Promise<void>
  contextUniverse: { id: string; name: string } | null
  ideaId: string | null
}) {
  const { t, tx } = useI18n()
  const belongsElsewhere =
    !isNew && contextUniverse !== null && stored.universeId !== contextUniverse.id

  return (
    <header className="idea__head">
      <Link className="idea__back" to={listPath} data-testid="idea-back">
        {listLabel}
      </Link>
      <div className="doc__titlerow">
        <h1 className="idea__heading" id={headingId} data-testid="idea-heading">
          {isNew ? t('ideas.editor.newIdea') : <bdi>{stored.title}</bdi>}
        </h1>
        {!isNew ? (
          <ActionMenu
            label={t('ideas.editor.moreActions', { title: stored.title })}
            triggerTestId="idea-actions"
          >
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={isSaving}
              onClick={() => void remove()}
              data-testid="idea-delete"
            >
              <ActionIcon icon={Trash2} />
              {t('ideas.editor.deleteIdea')}
            </button>
          </ActionMenu>
        ) : null}
      </div>
      <QuietNote className="idea__lede">
        {t('ideas.editor.lede')}
        {!isNew && stored.updatedAt ? (
          <>
            {' '}
            {tx('ideas.editor.lastSaved', {
              time: <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>,
            })}
          </>
        ) : null}
      </QuietNote>
      {belongsElsewhere ? (
        <p className="idea__elsewhere" data-testid="idea-elsewhere">
          {stored.universe
            ? tx('ideas.editor.belongsTo', {
                universe: <Quoted text={stored.universe.name} />,
                context: <Quoted text={contextUniverse.name} />,
              })
            : t('ideas.editor.belongsToNone')}{' '}
          {stored.universe ? (
            <Link to={`/app/universes/${stored.universe.id}/ideas/${ideaId}`}>
              {t('ideas.editor.openInAll')}
            </Link>
          ) : null}
        </p>
      ) : null}
    </header>
  )
}

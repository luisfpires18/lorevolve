import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { Quoted } from '../NameList'
import type { Stored } from '../../ideas/ideaDraft'
import { useI18n } from '../../i18n'
import { DocumentHead } from '../DocumentHead'
import { DateText } from '../DateText'

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
    <DocumentHead
      back={{ to: listPath, label: listLabel, testId: 'idea-back' }}
      title={isNew ? t('ideas.editor.newIdea') : <bdi>{stored.title}</bdi>}
      titleId={headingId}
      titleTestId="idea-heading"
      actions={
        !isNew ? (
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
        ) : null
      }
      lede={
        <>
          {t('ideas.editor.lede')}
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              {tx('ideas.editor.lastSaved', {
                time: <DateText value={stored.updatedAt} withTime />,
              })}
            </>
          ) : null}
        </>
      }
    >
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
    </DocumentHead>
  )
}

import { Link } from 'react-router-dom'
import { Callout } from '../Callout'
import { Quoted } from '../NameList'
import type { Stored } from '../../ideas/ideaDraft'
import { useI18n } from '../../i18n'

/** Under an idea editor's head: the note that the idea belongs to another universe than the one it is opened in. */
export function IdeaHead({
  isNew,
  stored,
  contextUniverse,
  ideaId,
}: {
  isNew: boolean
  stored: Stored
  contextUniverse: { id: string; name: string } | null
  ideaId: string | null
}) {
  const { t, tx } = useI18n()
  const belongsElsewhere =
    !isNew && contextUniverse !== null && stored.universeId !== contextUniverse.id
  if (!belongsElsewhere) return null

  return (
    <Callout look="callout" as="p" className="idea__elsewhere" testId="idea-elsewhere">
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
    </Callout>
  )
}

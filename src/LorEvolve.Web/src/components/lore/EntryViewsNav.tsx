import { NavLink } from 'react-router-dom'
import { ReviewComments } from '../ReviewComments'
import type { EntityDetail } from '../../lore/types'
import { useI18n } from '../../i18n'
import { draftFromDetail, type EntryFields } from '../../lore/entryDraft'
import { entryChanges } from '../../lore/entryChanges'
import type { UniverseCapabilities } from '../../universes/access'
import type { EntityType } from '../../lore/typeDefinitions'
import type { Chronology } from '../../chronology/types'

/** The entry's own views, as links, and the review comments beside them. */
export function EntryViewsNav({
  universe,
  chronology,
  access,
  entityId,
  types,
  detail,
  isWritingArticle,
  reloadAfterRestore,
  entryPath,
  startSuggesting,
}: {
  universe: { id: string }
  chronology: Chronology
  access: UniverseCapabilities
  entityId: string | undefined
  types: EntityType[]
  detail: EntityDetail | null
  isWritingArticle: boolean
  reloadAfterRestore: () => Promise<void>
  entryPath: string
  startSuggesting: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="entry__lenses">
      <nav className="views" aria-label={t('entity.page.views.label')} data-testid="entry-views">
        <NavLink to={entryPath} end className="views__link" data-testid="entry-view-article">
          {t('entity.page.views.article')}
        </NavLink>
        {/* An entry's progression (Issue #30): offered to whoever can add to it, and to everyone once it has any. */}
        {access.editContent || detail?.hasProgression ? (
          <NavLink
            to={`${entryPath}/progression`}
            className="views__link"
            data-testid="entry-view-progression"
          >
            {t('entity.page.views.progression')}
          </NavLink>
        ) : null}
        <NavLink
          to={`${entryPath}/relations`}
          className="views__link"
          data-testid="entry-view-relations"
        >
          {t('entity.page.views.relations')}
        </NavLink>
        {access.manageHistory ? (
          <NavLink
            to={`${entryPath}/history`}
            className="views__link"
            data-testid="entry-view-history"
          >
            {t('entity.page.views.history')}
          </NavLink>
        ) : null}
      </nav>
      {isWritingArticle ? null : (
        <ReviewComments
          universeId={universe.id}
          subject={{ kind: 'entry', entityId: entityId! }}
          subjectName={detail?.name ?? ''}
          describeSuggestion={(before: EntryFields, proposed: EntryFields) =>
            entryChanges(before, draftFromDetail(proposed), types, chronology, proposed)
          }
          onSuggestionAccepted={() => void reloadAfterRestore()}
          onSuggest={startSuggesting}
        />
      )}
    </div>
  )
}

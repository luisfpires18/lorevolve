import { ViewLinks } from '../ViewLinks'
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
      <ViewLinks
        label={t('entity.page.views.label')}
        testId="entry-views"
        items={[
          {
            to: entryPath,
            end: true,
            label: t('entity.page.views.article'),
            testId: 'entry-view-article',
          },
          // An entry's progression (Issue #30): offered to whoever can add to it, and to everyone once it has any.
          ...(access.editContent || detail?.hasProgression
            ? [
                {
                  to: `${entryPath}/progression`,
                  label: t('entity.page.views.progression'),
                  testId: 'entry-view-progression',
                },
              ]
            : []),
          {
            to: `${entryPath}/relations`,
            label: t('entity.page.views.relations'),
            testId: 'entry-view-relations',
          },
          ...(access.manageHistory
            ? [
                {
                  to: `${entryPath}/history`,
                  label: t('entity.page.views.history'),
                  testId: 'entry-view-history',
                },
              ]
            : []),
        ]}
      />
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

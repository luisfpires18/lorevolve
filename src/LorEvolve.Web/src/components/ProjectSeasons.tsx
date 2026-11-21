import { useCallback, useState } from 'react'
import { Section } from './Section'
import { createSeason, listSeasons } from '../projectEntities/seasons'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'
import { WORDS, type ProjectStructureWords } from '../projectEntities/seasonWords'
import { SeasonItem } from './projectEntities/SeasonItem'
import { NewButton } from './NewButton'
import { NameSummaryDrawer } from './NameSummaryDrawer'
import { useLoadedList } from '../lib/useLoadedList'
import { PageHeader } from './PageHeader'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

/**
 * The seasons of a project and the episodes in them (#145).
 *
 * <p>Offered to every project rather than only a Series, because a comic has volumes and issues and a project that
 * does not work this way can leave it empty. Order is moved one place at a time, up or down, which is the plainest
 * control that works with a keyboard and needs no drag.</p>
 */

export function ProjectSeasons({
  projectId,
  universeId,
  words = 'seasons',
  pages = false,
}: {
  projectId: string
  /** The project's universe, for the lore a comic's panels may name (#147). */
  universeId: string
  /** Which vocabulary to draw: a series' seasons, a film's sequences, or a comic's volumes. */
  words?: ProjectStructureWords
  /** Whether a chapter opens its pages and panels, which only a comic has. */
  pages?: boolean
}) {
  useI18n()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const say = WORDS[words]
  const read = useCallback((signal?: AbortSignal) => listSeasons(projectId, signal), [projectId])
  const {
    data: seasons,
    busy,
    failed,
    refresh,
    run,
  } = useLoadedList(read, t('projects.seasons.failed'), { emptyOnFail: [] })

  if (seasons === null) {
    return <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
  }

  return (
    <Section testId="project-seasons">
      <PageHeader
        level={2}
        size="panel"
        title={say.title()}
        lede={say.lede()}
        actions={
          <NewButton data-testid="project-season-add" onClick={() => setAdding(true)}>
            {say.add()}
          </NewButton>
        }
      />

      {adding ? (
        <NameSummaryDrawer
          testId="project-season-new"
          eyebrow={say.title()}
          title={say.add()}
          initial={null}
          busy={busy}
          words={{
            save: say.add(),
            saving: t('projects.seasons.saving'),
            name: t('projects.seasons.name'),
            leave: say.leave(),
            failed: t('projects.seasons.failed'),
          }}
          onClose={() => setAdding(false)}
          onSave={(input) =>
            createSeason(projectId, { name: input.name, summary: null })
              .then(refresh)
              .then(() => setAdding(false))
          }
        />
      ) : null}

      {failed ? <FormMessage testId="project-seasons-failed">{failed}</FormMessage> : null}

      {seasons.length === 0 ? (
        <EmptyState title={say.empty()} hint={say.emptyHint()} testId="project-seasons-empty" />
      ) : null}

      {seasons.length > 0 ? (
        <ol className="types__list" data-testid="project-season-list">
          {seasons.map((season, index) => (
            <SeasonItem
              key={season.id}
              projectId={projectId}
              universeId={universeId}
              pages={pages}
              seasons={seasons}
              busy={busy}
              renaming={renaming}
              setRenaming={setRenaming}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
              editing={editing}
              setEditing={setEditing}
              say={say}
              refresh={refresh}
              run={run}
              season={season}
              index={index}
            />
          ))}
        </ol>
      ) : null}
    </Section>
  )
}

import {
  createEpisode,
  deleteSeason,
  moveSeason,
  saveSeason,
  type ProjectSeason,
} from '../../projectEntities/seasons'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { ProjectStructureWords, WORDS } from '../../projectEntities/seasonWords'
import { EpisodeForm } from './EpisodeForm'
import { SeasonEpisodes } from './SeasonEpisodes'
import { NameSummaryDrawer } from '../NameSummaryDrawer'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { confirmDelete } from '../../lib/confirm'

/** One season's row: its verbs, its summary, its episodes, and the drawers that rename it and add an episode. */
export function SeasonItem({
  projectId,
  universeId,
  pages,
  seasons,
  busy,
  renaming,
  setRenaming,
  addingTo,
  setAddingTo,
  editing,
  setEditing,
  say,
  refresh,
  run,
  season,
  index,
}: {
  projectId: string
  universeId: string
  pages: boolean
  seasons: ProjectSeason[]
  busy: boolean
  renaming: string | null
  setRenaming: Dispatch<SetStateAction<string | null>>
  addingTo: string | null
  setAddingTo: Dispatch<SetStateAction<string | null>>
  editing: string | null
  setEditing: Dispatch<SetStateAction<string | null>>
  say: (typeof WORDS)[ProjectStructureWords]
  refresh: () => Promise<void>
  run: (work: () => Promise<unknown>) => void
  season: ProjectSeason
  index: number
}) {
  useI18n()

  async function remove() {
    await confirmDelete(
      {
        title: t('projects.structure.deleteTitle', { name: season.name }),
        message: t('projects.structure.deleteEmpty'),
        confirmLabel: say.delete(),
      },
      () => deleteSeason(projectId, season.id),
      run,
    )
  }

  return (
    <TypeRow
      testId={`project-season-${season.id}`}
      name={season.name}
      count={
        season.episodes.length === 0 ? say.noEpisodes() : say.episodeCount(season.episodes.length)
      }
      actions={
        <TypeRowActions
          name={season.name}
          move={{
            isFirst: index === 0,
            isLast: index === seasons.length - 1,
            busy,
            onMove: (direction) =>
              run(() =>
                moveSeason(projectId, season.id, { place: index + (direction === 'up' ? -1 : 1) }),
              ),
          }}
          moveTestIds={{
            up: `project-season-up-${season.id}`,
            down: `project-season-down-${season.id}`,
          }}
          addChild={{
            onAdd: () => setAddingTo(season.id),
            testId: `project-episode-add-${season.id}`,
          }}
          onEdit={() => setRenaming(season.id)}
          editTestId={`project-season-rename-${season.id}`}
          words={{
            addChild: say.addEpisode(),
            edit: t('projects.seasons.rename'),
            editLabel: t('projects.seasons.renameNamed', { name: season.name }),
            first: t('projects.common.alreadyFirst'),
            last: t('projects.common.alreadyLast'),
          }}
          onDelete={() => void remove()}
          deleteLabel={say.delete()}
          deleteDisabled={busy}
          deleteTestId={`project-season-delete-${season.id}`}
          menuTestId={`project-season-actions-${season.id}`}
        />
      }
    >
      {season.summary ? <p className="prose">{season.summary}</p> : null}

      <SeasonEpisodes
        projectId={projectId}
        universeId={universeId}
        pages={pages}
        seasons={seasons}
        busy={busy}
        editing={editing}
        setEditing={setEditing}
        say={say}
        refresh={refresh}
        run={run}
        season={season}
      />

      {renaming === season.id ? (
        <NameSummaryDrawer
          testId="project-season-rename"
          eyebrow={say.title()}
          title={t('projects.seasons.rename')}
          initial={{ name: season.name, summary: season.summary }}
          busy={busy}
          words={{
            save: t('projects.seasons.renameSave'),
            name: t('projects.seasons.name'),
            leave: say.leave(),
            failed: t('projects.seasons.failed'),
          }}
          onClose={() => setRenaming(null)}
          onSave={(input) =>
            saveSeason(projectId, season.id, { name: input.name, summary: season.summary })
              .then(refresh)
              .then(() => setRenaming(null))
          }
        />
      ) : null}

      {addingTo === season.id ? (
        <EpisodeForm
          busy={busy}
          eyebrow={season.name}
          addLabel={say.addEpisode()}
          leaveMessage={say.leaveEpisode()}
          onCancel={() => setAddingTo(null)}
          onSave={(title, synopsis) =>
            createEpisode(projectId, season.id, {
              title,
              synopsis,
              script: null,
              expectedVersion: null,
            })
              .then(refresh)
              .then(() => setAddingTo(null))
          }
        />
      ) : null}
    </TypeRow>
  )
}

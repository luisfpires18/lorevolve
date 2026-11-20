import { createPanel, deletePage, movePage, type ProjectPage } from '../../projectEntities/pages'
import { t, tn, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { PagePanels } from './PagePanels'
import { PanelForm } from './PanelForm'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { confirmDelete } from '../../lib/confirm'

/** One page in a chapter: its row with its verbs, its panels, and the drawer that adds a panel. */
export function PageRow({
  projectId,
  universeId,
  volumeId,
  chapterId,
  pages,
  page,
  index,
  busy,
  run,
  refresh,
  addingTo,
  setAddingTo,
}: {
  projectId: string
  universeId: string
  volumeId: string
  chapterId: string
  pages: ProjectPage[]
  page: ProjectPage
  index: number
  busy: boolean
  run: (work: () => Promise<unknown>) => void
  refresh: () => Promise<void>
  addingTo: string | null
  setAddingTo: Dispatch<SetStateAction<string | null>>
}) {
  useI18n()
  const name = page.name ?? String(index + 1)

  return (
    <TypeRow
      testId={`project-page-${page.id}`}
      name={name}
      count={
        page.panels.length === 0
          ? t('projects.pages.noPanels')
          : tn('projects.pages.panelCount', page.panels.length)
      }
      actions={
        <TypeRowActions
          name={name}
          move={{
            isFirst: index === 0,
            isLast: index === pages.length - 1,
            busy,
            onMove: (direction) =>
              run(() =>
                movePage(
                  projectId,
                  volumeId,
                  chapterId,
                  page.id,
                  index + (direction === 'up' ? -1 : 1),
                ),
              ),
          }}
          moveTestIds={{ up: `project-page-up-${page.id}`, down: `project-page-down-${page.id}` }}
          addChild={{ onAdd: () => setAddingTo(page.id), testId: `project-panel-add-${page.id}` }}
          words={{
            addChild: t('projects.pages.addPanel'),
            first: t('projects.common.alreadyFirst'),
            last: t('projects.common.alreadyLast'),
          }}
          onDelete={() =>
            void confirmDelete(
              {
                title: t('projects.pages.deleteTitle', { name }),
                message: t('projects.structure.deleteEmpty'),
                confirmLabel: t('projects.pages.delete'),
              },
              () => deletePage(projectId, volumeId, chapterId, page.id),
              run,
            )
          }
          deleteLabel={t('projects.pages.delete')}
          deleteDisabled={busy}
          deleteTestId={`project-page-delete-${page.id}`}
          menuTestId={`project-page-actions-${page.id}`}
        />
      }
    >
      <PagePanels
        projectId={projectId}
        universeId={universeId}
        volumeId={volumeId}
        chapterId={chapterId}
        page={page}
        busy={busy}
        run={run}
      />
      {addingTo === page.id ? (
        <PanelForm
          busy={busy}
          universeId={universeId}
          eyebrow={name}
          onCancel={() => setAddingTo(null)}
          onSave={(description, dialogue, canonEntityId) =>
            createPanel(projectId, volumeId, chapterId, page.id, {
              description,
              dialogue,
              canonEntityId,
            })
              .then(refresh)
              .then(() => setAddingTo(null))
          }
        />
      ) : null}
    </TypeRow>
  )
}

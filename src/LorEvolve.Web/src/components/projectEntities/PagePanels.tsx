import { Link } from 'react-router-dom'
import { deletePanel, movePanel, savePanel, type ProjectPage } from '../../projectEntities/pages'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { t, useI18n } from '../../i18n'
import { PanelLore } from './PanelLore'
import { confirmDelete } from '../../lib/confirm'
import { QuietNote } from '../QuietNote'

/** A page's panels, each a row with what it shows, what is said, and its menu. */
export function PagePanels({
  projectId,
  universeId,
  volumeId,
  chapterId,
  page,
  busy,
  run,
}: {
  projectId: string
  universeId: string
  volumeId: string
  chapterId: string
  page: ProjectPage
  busy: boolean
  run: (work: () => Promise<unknown>) => void
}) {
  useI18n()

  if (page.panels.length === 0) return null

  return (
    <ol className="types__list" data-testid={`project-panels-${page.id}`}>
      {page.panels.map((panel, place) => (
        <TypeRow
          key={panel.id}
          testId={`project-panel-${panel.id}`}
          name={panel.description ?? ''}
          actions={
            <TypeRowActions
              name={panel.description ?? String(place + 1)}
              move={{
                isFirst: place === 0,
                isLast: place === page.panels.length - 1,
                busy,
                onMove: (direction) =>
                  run(() =>
                    movePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                      place: place + (direction === 'up' ? -1 : 1),
                    }),
                  ),
              }}
              moveTestIds={{
                up: `project-panel-up-${panel.id}`,
                down: `project-panel-down-${panel.id}`,
              }}
              words={{
                first: t('projects.common.alreadyFirst'),
                last: t('projects.common.alreadyLast'),
              }}
              onDelete={() =>
                void confirmDelete(
                  {
                    title: t('projects.pages.deletePanelTitle', {
                      name: panel.description ?? String(place + 1),
                    }),
                    message: t('projects.structure.deleteEmpty'),
                    confirmLabel: t('projects.pages.deletePanel'),
                  },
                  () => deletePanel(projectId, volumeId, chapterId, page.id, panel.id),
                  run,
                )
              }
              deleteLabel={t('projects.pages.deletePanel')}
              deleteDisabled={busy}
              deleteTestId={`project-panel-delete-${panel.id}`}
              menuTestId={`project-panel-actions-${panel.id}`}
            />
          }
        >
          {panel.dialogue ? <blockquote>{panel.dialogue}</blockquote> : null}
          <QuietNote as="span">
            {t('projects.pages.shows')}:{' '}
            {panel.canonEntityId && panel.canonEntityName ? (
              // A usable way through to the entry, which is where its picture is served from: the Media
              // feature draws it on the entry's own screen, and this points at that rather than copying it.
              <Link
                to={`/app/universes/${universeId}/lore/${panel.canonEntityId}`}
                data-testid={`project-panel-shows-${panel.id}`}
              >
                {panel.canonEntityName}
              </Link>
            ) : (
              t('projects.pages.showsNone')
            )}
          </QuietNote>

          <PanelLore
            universeId={universeId}
            panelId={panel.id}
            chosen={
              panel.canonEntityId && panel.canonEntityName
                ? { id: panel.canonEntityId, name: panel.canonEntityName }
                : null
            }
            busy={busy}
            onChange={(choice) =>
              run(() =>
                savePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                  description: panel.description,
                  dialogue: panel.dialogue,
                  canonEntityId: choice?.id ?? null,
                }),
              )
            }
          />
        </TypeRow>
      ))}
    </ol>
  )
}

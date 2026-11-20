import { Link } from 'react-router-dom'
import { deletePanel, movePanel, savePanel, type ProjectPage } from '../../projectEntities/pages'
import { ActionMenu } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { t, useI18n } from '../../i18n'
import { PanelLore } from './PanelLore'
import { Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'

/** A page's panels, each with what it shows, what is said, and its menu. */
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

  return (
    <ol className="projectcard__inner" data-testid={`project-panels-${page.id}`}>
      {page.panels.map((panel, place) => (
        <li key={panel.id} data-testid={`project-panel-${panel.id}`}>
          <span>{panel.description ?? ''}</span>
          {panel.dialogue ? <blockquote>{panel.dialogue}</blockquote> : null}
          <span className="projectcard__meta">
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
          </span>

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

          <div className="projectcard__actions">
            <ActionMenu
              label={t('projects.common.more', {
                name: panel.description ?? String(place + 1),
              })}
              triggerTestId={`project-panel-actions-${panel.id}`}
            >
              <MoveItems
                first={place === 0}
                last={place === page.panels.length - 1}
                busy={busy}
                testIds={{
                  up: `project-panel-up-${panel.id}`,
                  down: `project-panel-down-${panel.id}`,
                }}
                onMove={(step) =>
                  run(() =>
                    movePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                      place: place + step,
                    }),
                  )
                }
              />
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={busy}
                data-testid={`project-panel-delete-${panel.id}`}
                onClick={() =>
                  run(() => deletePanel(projectId, volumeId, chapterId, page.id, panel.id))
                }
              >
                <ActionIcon icon={Trash} />
                {t('projects.pages.deletePanel')}
              </button>
            </ActionMenu>
          </div>
        </li>
      ))}
    </ol>
  )
}

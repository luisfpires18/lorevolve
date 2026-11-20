import { createPanel, deletePage, movePage, type ProjectPage } from '../../projectEntities/pages'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { t, tn, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { PagePanels } from './PagePanels'
import { PanelForm } from './PanelForm'
import { NewButton } from '../NewButton'
import { Trash } from 'lucide-react'
import { confirmAction } from '../../lib/confirm'

/** One page in a chapter: its name, its menu, its panels, and the form to add a panel. */
export function PageRow({
  projectId,
  universeId,
  volumeId,
  chapterId,
  pages,
  page,
  index,
  busy,
  setBusy,
  run,
  refresh,
  failing,
  addingTo,
  setAddingTo,
}: {
  projectId: string
  universeId: string
  volumeId: string
  chapterId: string
  pages: ProjectPage[] | null
  page: ProjectPage
  index: number
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  run: (work: () => Promise<unknown>) => void
  refresh: () => Promise<void>
  failing: (error: unknown) => void
  addingTo: string | null
  setAddingTo: Dispatch<SetStateAction<string | null>>
}) {
  useI18n()

  return (
    <li className="fieldlist__row" data-testid={`project-page-${page.id}`}>
      <span className="fieldlist__text">
        <span className="fieldlist__name">{page.name ?? String(index + 1)}</span>
        <span className="fieldlist__meta">
          {page.panels.length === 0
            ? t('projects.pages.noPanels')
            : tn('projects.pages.panelCount', page.panels.length)}
        </span>
      </span>
      <div className="actions actions--compact fieldlist__actions">
        <ActionMenu
          label={t('projects.common.more', { name: page.name ?? String(index + 1) })}
          triggerTestId={`project-page-actions-${page.id}`}
        >
          <MoveItems
            first={index === 0}
            last={index === (pages ?? []).length - 1}
            busy={busy}
            testIds={{ up: `project-page-up-${page.id}`, down: `project-page-down-${page.id}` }}
            onMove={(step) =>
              run(() => movePage(projectId, volumeId, chapterId, page.id, index + step))
            }
          />
          <ActionMenuItem
            icon={Trash}
            tone="danger"
            disabled={busy}
            testId={`project-page-delete-${page.id}`}
            onClick={async () => {
              const confirmed = await confirmAction({
                title: t('projects.pages.deleteTitle', { name: page.name ?? String(index + 1) }),
                message: t('projects.structure.deleteEmpty'),
                confirmLabel: t('projects.pages.delete'),
                variant: 'destructive',
              })
              if (confirmed) run(() => deletePage(projectId, volumeId, chapterId, page.id))
            }}
          >
            {t('projects.pages.delete')}
          </ActionMenuItem>
        </ActionMenu>
      </div>
      {/* Under the page's own row rather than beside it: the row is a line, its panels are a list. */}
      <div className="projectcard__under">
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
            onCancel={() => setAddingTo(null)}
            onSubmit={(description, dialogue, canonEntityId) => {
              setBusy(true)
              createPanel(projectId, volumeId, chapterId, page.id, {
                description,
                dialogue,
                canonEntityId,
              })
                .then(() => {
                  setAddingTo(null)
                  return refresh()
                })
                .catch(failing)
            }}
          />
        ) : (
          <NewButton
            tone="secondary"
            size="sm"
            data-testid={`project-panel-add-${page.id}`}
            onClick={() => setAddingTo(page.id)}
          >
            {t('projects.pages.addPanel')}
          </NewButton>
        )}
      </div>
    </li>
  )
}

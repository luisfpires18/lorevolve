import { ArrowDown, ArrowUp, Image as ImageIcon } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { ShelfCard, shelfStep, type ShelfFrame } from '../ShelfCard'
import { pictureUrl, projectCoverStore } from '../../covers/api'
import { t } from '../../i18n'
import { formatLabel, kindLabel, lifecycleLabel, projectRowPath } from '../../projects/sections'
import type { ProjectKindValue } from '../../projects/types'
import type { useUniverseAccess } from '../../universes/access'
import type { shelfActions } from '../../projects/shelfActions'
import type { useShelfState } from '../../projects/useShelfState'

export function ShelfCards({
  frame,
  kinds,
  state,
  access,
  setCovering,
  neighbour,
  move,
}: {
  frame: ShelfFrame
  kinds: readonly ProjectKindValue[]
  state: Extract<ReturnType<typeof useShelfState>['state'], { kind: 'ready' }>
  access: ReturnType<typeof useUniverseAccess>
  setCovering: ReturnType<typeof useShelfState>['setCovering']
  neighbour: ReturnType<typeof shelfActions>['neighbour']
  move: ReturnType<typeof shelfActions>['move']
}) {
  return (
    <ul
      className={frame === 'console' || frame === 'film' ? 'shelf shelf--wide' : 'shelf'}
      data-testid="projects-list"
    >
      {state.value.map((project, index) => (
        <ShelfCard
          key={project.id}
          frame={frame}
          href={projectRowPath(project)}
          title={project.name}
          description={project.summary}
          step={shelfStep(project.lifecycle)}
          statusLabel={lifecycleLabel(project.lifecycle)}
          meta={
            // A shelf of two kinds names each card's kind: a film and a series may share a name.
            [
              kinds.length > 1 ? kindLabel(project.kind) : null,
              project.format ? formatLabel(project.format) : project.subtype,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          cover={
            project.cover
              ? pictureUrl(projectCoverStore(project.id, project.kind), project.cover, 'card')
              : null
          }
          openTestId={`projects-row-${project.id}`}
          onAddPicture={access.editContent ? () => setCovering(project) : undefined}
          attrs={{
            'data-testid': 'projects-item',
            'data-project-id': project.id,
            'data-kind': String(project.kind),
          }}
          menu={
            access.editContent ? (
              <ActionMenu
                label={t('projects.common.more', { name: project.name })}
                triggerTestId="shelf-actions"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => setCovering(project)}
                  data-testid="shelf-cover"
                >
                  <ActionIcon icon={ImageIcon} />
                  {t(
                    project.cover ? 'projects.common.changePicture' : 'projects.common.addPicture',
                  )}
                </button>
                {neighbour(state.value, index, -1) >= 0 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => void move(project, -1)}
                    data-testid="shelf-move-up"
                  >
                    <ActionIcon icon={ArrowUp} />
                    {t('projects.common.moveUp')}
                  </button>
                ) : null}
                {neighbour(state.value, index, 1) >= 0 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => void move(project, 1)}
                    data-testid="shelf-move-down"
                  >
                    <ActionIcon icon={ArrowDown} />
                    {t('projects.common.moveDown')}
                  </button>
                ) : null}
              </ActionMenu>
            ) : null
          }
        />
      ))}
    </ul>
  )
}

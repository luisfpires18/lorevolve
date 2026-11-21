import type { ReactNode } from 'react'
import { ActionMenuItem } from '../ActionMenu'
import { RowMenu } from '../RowMenu'
import { MoveItems } from '../MoveItems'
import { OutlineItem } from '../OutlineItem'
import {
  addableLevels,
  childrenOf,
  moveNode,
  moveTargets,
  type ProjectNodeSummary,
  type ProjectStructureTree,
} from '../../projectEntities/structure'
import { capital, levelWord, nameOf } from '../../projectEntities/levelWords'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { NewButton } from '../NewButton'
import { Button } from '../Button'
import { FolderInput } from 'lucide-react'

type OutlineBranchProps = {
  parentId: string | null
  depth?: number
  projectId: string
  tree: ProjectStructureTree
  busy: boolean
  setEditing: Dispatch<SetStateAction<string | null>>
  run: (work: () => Promise<unknown>) => void
  add: (level: string, parentId: string | null) => void
  remove: (current: ProjectStructureTree, node: ProjectNodeSummary) => Promise<void>
}

/** The nodes under one parent as an ordered list, each with its tools, and its own nodes below it. */
export function OutlineBranch(props: OutlineBranchProps): ReactNode {
  const { parentId, depth = 0, projectId, tree, busy, setEditing, run, add, remove } = props
  useI18n()

  const current = tree as ProjectStructureTree
  const nodes = childrenOf(current, parentId)
  if (nodes.length === 0) return null
  return (
    <ol className="scenes" data-testid={`project-outline-list-${parentId ?? 'root'}`}>
      {nodes.map((node, index) => {
        const leaf = addableLevels(current, node.level).length === 0
        return (
          <OutlineItem
            key={node.id}
            variant={leaf ? 'card' : 'group'}
            top={depth === 0}
            number={index + 1}
            name={nameOf(node)}
            meta={capital(levelWord(node.level))}
            summary={node.summary}
            titleLevel={Math.min(3 + depth, 6) as 3 | 4 | 5 | 6}
            testId={`project-node-${node.id}`}
            foldLabel={nameOf(node)}
            tools={
              <>
                {addableLevels(current, node.level).map((level) => (
                  <NewButton
                    key={level}
                    tone="secondary"
                    disabled={busy}
                    data-testid={`project-node-add-${level}-${node.id}`}
                    onClick={() => add(level, node.id)}
                  >
                    {t('projects.structure.add', { level: levelWord(level) })}
                  </NewButton>
                ))}
                <Button
                  tone="text"
                  data-testid={`project-node-open-${node.id}`}
                  onClick={() => setEditing(node.id)}
                >
                  {t('projects.structure.edit')}
                </Button>
                <RowMenu
                  label={t('projects.common.more', { name: nameOf(node) })}
                  triggerTestId={`project-node-actions-${node.id}`}
                  busy={busy}
                  onRemove={() => void remove(current, node)}
                  removeLabel={t('projects.structure.delete')}
                  removeTestId={`project-node-delete-${node.id}`}
                >
                  <MoveItems
                    first={index === 0}
                    last={index === nodes.length - 1}
                    busy={busy}
                    testIds={{
                      up: `project-node-up-${node.id}`,
                      down: `project-node-down-${node.id}`,
                    }}
                    onMove={(step) =>
                      run(() => moveNode(projectId, node.id, { place: index + step, parentId }))
                    }
                  />
                  {moveTargets(current, node).map((target) => (
                    <ActionMenuItem
                      icon={FolderInput}
                      key={target?.id ?? 'root'}
                      disabled={busy}
                      testId={`project-node-move-${node.id}-${target?.id ?? 'root'}`}
                      onClick={() =>
                        // Moved to the end of its new list; the server clamps the place.
                        run(() =>
                          moveNode(projectId, node.id, {
                            place: Number.MAX_SAFE_INTEGER,
                            parentId: target?.id ?? null,
                          }),
                        )
                      }
                    >
                      {target
                        ? t('projects.structure.moveTo', { name: nameOf(target) })
                        : t('projects.structure.moveToTop')}
                    </ActionMenuItem>
                  ))}
                </RowMenu>
              </>
            }
          >
            {leaf ? null : <OutlineBranch {...props} parentId={node.id} depth={depth + 1} />}
          </OutlineItem>
        )
      })}
    </ol>
  )
}

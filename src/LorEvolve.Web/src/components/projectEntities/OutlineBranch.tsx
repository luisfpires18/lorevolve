import type { ReactNode } from 'react'
import { ActionMenu } from '../ActionMenu'
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
import { OutlineAddButtons } from './OutlineAddButtons'
import { Button } from '../Button'
import { ArrowDown, ArrowUp, FolderInput, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'

type OutlineBranchProps = {
  parentId: string | null
  depth?: number
  projectId: string
  tree: ProjectStructureTree
  busy: boolean
  setEditing: Dispatch<SetStateAction<string | null>>
  run: (work: Promise<unknown>) => void
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
                {leaf ? null : (
                  <OutlineAddButtons parent={node} tree={tree} busy={busy} add={add} />
                )}
                <Button
                  tone="text"
                  data-testid={`project-node-open-${node.id}`}
                  onClick={() => setEditing(node.id)}
                >
                  {t('projects.structure.edit')}
                </Button>
                <ActionMenu
                  label={t('projects.common.more', { name: nameOf(node) })}
                  triggerTestId={`project-node-actions-${node.id}`}
                >
                  {index === 0 ? null : (
                    <button
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-up-${node.id}`}
                      onClick={() =>
                        run(moveNode(projectId, node.id, { place: index - 1, parentId }))
                      }
                    >
                      <ActionIcon icon={ArrowUp} />
                      {t('projects.common.moveUp')}
                    </button>
                  )}
                  {index === nodes.length - 1 ? null : (
                    <button
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-down-${node.id}`}
                      onClick={() =>
                        run(moveNode(projectId, node.id, { place: index + 1, parentId }))
                      }
                    >
                      <ActionIcon icon={ArrowDown} />
                      {t('projects.common.moveDown')}
                    </button>
                  )}
                  {moveTargets(current, node).map((target) => (
                    <button
                      key={target?.id ?? 'root'}
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-move-${node.id}-${target?.id ?? 'root'}`}
                      onClick={() =>
                        // Moved to the end of its new list; the server clamps the place.
                        run(
                          moveNode(projectId, node.id, {
                            place: Number.MAX_SAFE_INTEGER,
                            parentId: target?.id ?? null,
                          }),
                        )
                      }
                    >
                      <ActionIcon icon={FolderInput} />
                      {target
                        ? t('projects.structure.moveTo', { name: nameOf(target) })
                        : t('projects.structure.moveToTop')}
                    </button>
                  ))}
                  <button
                    className="actionmenu__item actionmenu__item--danger"
                    type="button"
                    disabled={busy}
                    data-testid={`project-node-delete-${node.id}`}
                    onClick={() => void remove(current, node)}
                  >
                    <ActionIcon icon={Trash} />
                    {t('projects.structure.delete')}
                  </button>
                </ActionMenu>
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

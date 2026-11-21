import type { ReactNode } from 'react'
import { ActionMenuItem } from '../ActionMenu'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { useFold } from '../fold'
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

/** The nodes under one parent as a types list, each with its tools, and its own nodes below it. */
export function OutlineBranch(props: OutlineBranchProps): ReactNode {
  const { parentId, tree } = props
  const nodes = childrenOf(tree, parentId)
  if (nodes.length === 0) return null
  return (
    <ul className="types__list" data-testid={`project-outline-list-${parentId ?? 'root'}`}>
      {nodes.map((node, index) => (
        <OutlineNode key={node.id} {...props} node={node} index={index} count={nodes.length} />
      ))}
    </ul>
  )
}

/**
 * One node: its number, name, level and summary, its tools, and its own nodes below it. A node that may hold others
 * folds them, open to start with; a node that may not has no fold.
 */
function OutlineNode({
  node,
  index,
  count,
  ...props
}: OutlineBranchProps & { node: ProjectNodeSummary; index: number; count: number }) {
  const { parentId, depth = 0, projectId, tree, busy, setEditing, run, add, remove } = props
  useI18n()
  const { open, setOpen, ref, bodyId } = useFold<HTMLLIElement>(true)
  const levels = addableLevels(tree, node.level)
  const leaf = levels.length === 0
  const name = nameOf(node)

  return (
    <TypeRow
      ref={ref}
      testId={`project-node-${node.id}`}
      name={name}
      // A node that holds others reads as it always did, its number first: "1: Act One".
      heading={{
        level: Math.min(3 + depth, 6) as 3 | 4 | 5 | 6,
        prefix: leaf ? undefined : index + 1,
      }}
      lead={leaf ? <span aria-hidden="true">{index + 1}</span> : undefined}
      count={capital(levelWord(node.level))}
      actions={
        <>
          {levels.map((level) => (
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
          <TypeRowActions
            name={name}
            move={{
              isFirst: index === 0,
              isLast: index === count - 1,
              busy,
              onMove: (direction) =>
                run(() =>
                  moveNode(projectId, node.id, {
                    place: index + (direction === 'up' ? -1 : 1),
                    parentId,
                  }),
                ),
            }}
            moveTestIds={{ up: `project-node-up-${node.id}`, down: `project-node-down-${node.id}` }}
            onEdit={() => setEditing(node.id)}
            editTestId={`project-node-open-${node.id}`}
            fold={
              leaf
                ? undefined
                : {
                    open: open,
                    count: 0,
                    onToggle: () => setOpen(!open),
                    testId: `project-node-${node.id}-toggle`,
                    controls: bodyId,
                    label: name,
                  }
            }
            words={{
              edit: t('projects.structure.edit'),
              more: t('projects.common.more', { name }),
              first: t('projects.common.alreadyFirst'),
              last: t('projects.common.alreadyLast'),
            }}
            menuItems={moveTargets(tree, node).map((target) => (
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
            onDelete={() => void remove(tree, node)}
            deleteLabel={t('projects.structure.delete')}
            deleteDisabled={busy}
            deleteTestId={`project-node-delete-${node.id}`}
            menuTestId={`project-node-actions-${node.id}`}
          />
        </>
      }
    >
      {leaf ? (
        node.summary ? (
          <p className="types__description prose">{node.summary}</p>
        ) : null
      ) : (
        <div id={bodyId} hidden={!open} data-fold={bodyId}>
          {node.summary ? <p className="types__description prose">{node.summary}</p> : null}
          <OutlineBranch {...props} parentId={node.id} depth={depth + 1} />
        </div>
      )}
    </TypeRow>
  )
}

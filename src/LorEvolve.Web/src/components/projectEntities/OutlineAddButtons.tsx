import { NewButton } from '../NewButton'
import {
  addableLevels,
  type ProjectNodeSummary,
  type ProjectStructureTree,
} from '../../projectEntities/structure'
import { levelWord } from '../../projectEntities/levelWords'
import { t, useI18n } from '../../i18n'

/** The Add buttons for the levels the rules allow under a node, or at the top when there is none. */
export function OutlineAddButtons({
  parent,
  tree,
  busy,
  add,
}: {
  parent: ProjectNodeSummary | null
  tree: ProjectStructureTree
  busy: boolean
  add: (level: string, parentId: string | null) => void
}) {
  useI18n()

  const levels = addableLevels(tree as ProjectStructureTree, parent?.level ?? null)
  if (levels.length === 0) return null
  const buttons = levels.map((level) => (
    <NewButton
      key={level}
      tone={parent ? 'secondary' : 'primary'}
      disabled={busy}
      data-testid={parent ? `project-node-add-${level}-${parent.id}` : `project-node-add-${level}`}
      onClick={() => add(level, parent?.id ?? null)}
    >
      {t('projects.structure.add', { level: levelWord(level) })}
    </NewButton>
  ))
  return parent ? buttons : <div className="actions form__actions">{buttons}</div>
}

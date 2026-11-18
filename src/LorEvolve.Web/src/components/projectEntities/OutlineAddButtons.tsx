import { Plus } from 'lucide-react'
import { Button } from '../Button'
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
    <Button
      key={level}
      tone={parent ? 'text' : 'primary'}
      icon={parent ? Plus : undefined}
      disabled={busy}
      data-testid={parent ? `project-node-add-${level}-${parent.id}` : `project-node-add-${level}`}
      onClick={() => add(level, parent?.id ?? null)}
    >
      {t('projects.structure.add', { level: levelWord(level) })}
    </Button>
  ))
  return parent ? buttons : <div className="form__actions">{buttons}</div>
}

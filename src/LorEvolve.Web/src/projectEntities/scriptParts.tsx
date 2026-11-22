import type { ManuscriptPartGroup } from '../components/ManuscriptParts'
import { t } from '../i18n'
import { nameOf } from './levelWords'
import { childrenOf, type ProjectNodeSummary, type ProjectStructureTree } from './structure'

export function scriptParts({
  tree,
  scriptPath,
}: {
  tree: ProjectStructureTree
  scriptPath: string
}) {
  const part = (node: ProjectNodeSummary) => ({
    id: node.id,
    title: nameOf(node),
    to: `${scriptPath}?node=${node.id}`,
    mark:
      node.bodyLength > 0 ? (
        <span className="visually-hidden">{`, ${t('projects.script.hasText')}`}</span>
      ) : null,
  })
  // Depth first: every level holds text, so every node is a part. A top node with parts under it heads its own group;
  // top nodes with none (a short film's scenes) share one unnamed group, so no part is listed twice.
  const groups: ManuscriptPartGroup[] = []
  for (const root of childrenOf(tree, null)) {
    const parts: ReturnType<typeof part>[] = []
    const walk = (node: ProjectNodeSummary) => {
      parts.push(part(node))
      childrenOf(tree, node.id).forEach(walk)
    }
    walk(root)
    const last = groups.at(-1)
    if (parts.length > 1) groups.push({ key: root.id, label: <bdi>{nameOf(root)}</bdi>, parts })
    else if (last && !last.label)
      groups[groups.length - 1] = { ...last, parts: [...last.parts, ...parts] }
    else groups.push({ key: root.id, parts })
  }

  return groups
}

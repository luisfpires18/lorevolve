import { linkSentence } from '../../familyTree/reading'
import type { FamilyTree } from '../../familyTree/types'
import { useI18n } from '../../i18n'
import type { FamilyTreeNode } from '../../familyTree/types'

export function FamilyTreeNotes({
  tree,
  focal,
  nodes,
}: {
  tree: FamilyTree
  focal: FamilyTreeNode
  nodes: Map<string, FamilyTreeNode>
}) {
  const { t, tx } = useI18n()

  return (
    <>
      {focal.entityTypeFamilyTreeEligible ? null : (
        <p className="notice" data-testid="family-type-not-enabled">
          {tx('places.familyPage.typeNotEnabled', {
            type: <bdi>{focal.entityTypeName}</bdi>,
          })}
        </p>
      )}

      {tree.loops.length > 0 ? (
        <div className="callout callout--warning family__loopnote" data-testid="family-loop">
          <p className="callout__title">{t('places.familyPage.loopTitle')}</p>
          <p>{t('places.familyPage.loopBody')}</p>
          <ul className="family__loop">
            {tree.loops.flatMap((loop) =>
              loop.relationshipIds.map((id) => {
                const link = tree.links.find((candidate) => candidate.relationshipId === id)
                return link ? (
                  <li key={id} dir="auto">
                    {linkSentence(link, nodes)}
                  </li>
                ) : null
              }),
            )}
          </ul>
        </div>
      ) : null}
    </>
  )
}

import { FamilySemantic } from '../../relationships/types'
import { useI18n } from '../../i18n'
import { CONNECTION } from '../../familyTree/drawEdges'

export function FamilyTreeLegend({ caption }: { caption: string[] }) {
  const { t } = useI18n()

  return (
    <>
      <p className="familytree__caption" aria-live="polite" data-testid="family-caption">
        {caption.length > 0 ? caption.join('; ') : t('places.treeView.caption')}
      </p>

      <p className="familytree__legend" data-testid="family-legend">
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.BiologicalParent}
          aria-hidden="true"
        />
        <span>{t('places.treeView.legendBiological')}</span>
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.AdoptiveParent}
          aria-hidden="true"
        />
        <span>{t('places.treeView.legendAdoptive')}</span>
        <span className="familytree__key" data-semantic={CONNECTION} aria-hidden="true" />
        <span>{t('places.treeView.legendOther')}</span>
        <span className="familytree__legendnote">{t('places.treeView.legendNote')}</span>
      </p>
    </>
  )
}

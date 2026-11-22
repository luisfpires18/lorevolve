import { useI18n } from '../../i18n'
import type { SelectedLore } from '../../publishing/types'
import { QuietNote } from '../QuietNote'
import { NameListBlock } from './NameListBlock'

/**
 * The lore entries that become public with the world (Issue #47), by name and type: a private universe's entry pages do
 * not show which were selected, so the owner reviews them here before saying yes. Nothing here changes a selection.
 */
export function SelectedLoreReview({ selected }: { selected: SelectedLore }) {
  const { t, tn } = useI18n()
  const { totalCount, items } = selected
  if (totalCount === 0) {
    return (
      <QuietNote spacing="block" testId="publish-confirm-no-selected-lore">
        <strong>{t('universe.publish.selected.loreLabel')}</strong>{' '}
        {t('universe.publish.selected.none')}
      </QuietNote>
    )
  }

  return (
    <NameListBlock
      id="publish-confirm-lore"
      testId="publish-confirm-selected-lore"
      label={t('universe.publish.selected.alsoPublic')}
      note={tn('universe.publish.selected.some', totalCount, { n: totalCount })}
      items={items.map((entry) => ({
        id: entry.id,
        name: entry.name,
        aside: <bdi>{entry.typeName}</bdi>,
        testId: 'publish-confirm-selected-entry',
      }))}
    >
      {totalCount > items.length ? (
        <QuietNote spacing="block" testId="publish-confirm-selected-more">
          {t('universe.publish.selected.more', { n: totalCount - items.length })}
        </QuietNote>
      ) : null}
      <QuietNote spacing="block">{t('universe.publish.selected.again')}</QuietNote>
    </NameListBlock>
  )
}

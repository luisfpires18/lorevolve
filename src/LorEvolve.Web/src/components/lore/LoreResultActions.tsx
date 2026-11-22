import { ListChecks } from 'lucide-react'
import { useI18n } from '../../i18n'
import { LORE_PAGE_SIZES } from '../../lore/api'
import type { EntityPage, EntitySort } from '../../lore/types'
import { useUniverseAccess } from '../../universes/access'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import { Button } from '../Button'
import { Field } from '../Field'

type Entries = ReturnType<typeof useLoreEntries>
type Links = ReturnType<typeof useLoreLinks>
type Selection = ReturnType<typeof useLoreSelection>

/** What acts on the list: the order, the page size, Select, Create and Mass create. */
export function LoreResultActions({
  pageSize,
  chosenName,
  update,
  isSelecting,
  setIsSelecting,
  pageItems,
  stopSelecting,
  access,
  sort,
  changePageSize,
  offerPageSize,
  ranked,
}: {
  access: ReturnType<typeof useUniverseAccess>
  sort: EntitySort | null
  result: EntityPage | null
  changePageSize: (next: number) => void
  offerPageSize: boolean
  ranked: boolean
} & Pick<Entries, 'pageSize' | 'chosenName'> &
  Pick<Links, 'update'> &
  Pick<Selection, 'isSelecting' | 'setIsSelecting' | 'pageItems' | 'stopSelecting'>) {
  const { t } = useI18n()
  return (
    <>
      {chosenName ? (
        <div className="actions lore__resultactions" data-testid="lore-result-actions">
          <Field
            as="select"
            look="inline"
            id="lore-sort"
            label={t('lore.page.sortBy')}
            value={sort ?? ''}
            onChange={(event) => update({ sort: event.target.value || null, page: null }, true)}
            data-testid="lore-sort"
          >
            <option value="">
              {ranked ? t('lore.page.sortBest') : t('lore.page.sortUpdated')}
            </option>
            {ranked ? <option value="updated">{t('lore.page.sortUpdated')}</option> : null}
            <option value="name">{t('lore.page.sortName')}</option>
            <option value="created">{t('lore.page.sortCreated')}</option>
          </Field>
          {offerPageSize ? (
            <Field
              as="select"
              look="inline"
              id="lore-page-size"
              label={t('lore.page.perPage')}
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              data-testid="lore-page-size"
            >
              {LORE_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Field>
          ) : null}
          {access.manageTrash && (pageItems.length > 0 || isSelecting) ? (
            <Button
              tone="secondary"
              icon={ListChecks}
              className="lore__select"
              aria-pressed={isSelecting}
              onClick={() => (isSelecting ? stopSelecting() : setIsSelecting(true))}
              data-testid="lore-select"
            >
              {t('lore.page.select')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

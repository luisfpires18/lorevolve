import { Plus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { typeChoices } from '../../lore/typeTree'
import { MASS_CREATE_MAX } from '../../lore/massCreate'
import type { useMassRows } from '../../lore/useMassRows'

type Rows = ReturnType<typeof useMassRows>

import { MassCreateRow } from './MassCreateRow'
import { Button } from '../Button'

/** The rows to create, under their column names, and Add row. */
export function MassCreateReview({
  id,
  choices,
  rows,
  attempted,
  serverProblems,
  problems,
  repeats,
  controlId,
  updateRow,
  removeRow,
  addRow,
}: Pick<
  Rows,
  | 'rows'
  | 'attempted'
  | 'serverProblems'
  | 'problems'
  | 'repeats'
  | 'controlId'
  | 'updateRow'
  | 'removeRow'
  | 'addRow'
> & { id: string; choices: ReturnType<typeof typeChoices> }) {
  const { t } = useI18n()
  return (
    <section className="masscreate__review" aria-labelledby={`${id}-review`}>
      <div className="masscreate__reviewhead">
        <h2 className="masscreate__heading" id={`${id}-review`}>
          {t('lore.massCreate.entriesHeading')}
        </h2>
        <span className="masscreate__count" data-testid="mass-count">
          {t('lore.massCreate.count', { rows: rows.length, max: MASS_CREATE_MAX })}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="masscreate__empty">{t('lore.massCreate.empty')}</p>
      ) : (
        <>
          <div className="masscreate__columns" aria-hidden="true">
            <span />
            <span>{t('lore.massCreate.columnName')}</span>
            <span>{t('lore.massCreate.columnType')}</span>
            <span>{t('lore.massCreate.columnStatus')}</span>
            <span />
          </div>
          <ol className="masscreate__rows" data-testid="mass-rows">
            {rows.map((row, index) => (
              <MassCreateRow
                key={row.key}
                row={row}
                index={index}
                id={id}
                choices={choices}
                attempted={attempted}
                serverProblems={serverProblems}
                problems={problems}
                repeats={repeats}
                controlId={controlId}
                updateRow={updateRow}
                removeRow={removeRow}
              />
            ))}
          </ol>
        </>
      )}

      <Button
        tone="secondary"
        size="sm"
        icon={Plus}
        id={`${id}-add`}
        onClick={addRow}
        disabled={rows.length >= MASS_CREATE_MAX}
        title={
          rows.length >= MASS_CREATE_MAX
            ? t('lore.massCreate.limit', { max: MASS_CREATE_MAX })
            : undefined
        }
        data-testid="mass-add-row"
      >
        {t('lore.massCreate.addRow')}
      </Button>
    </section>
  )
}

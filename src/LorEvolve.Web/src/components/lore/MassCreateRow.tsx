import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { typeChoices } from '../../lore/typeTree'
import {
  hasRequiredFields,
  type MassRow,
  type RowField,
  type RowProblem,
} from '../../lore/massCreate'
import { CANON_LABELS, CANON_ORDER, type CanonStatusValue } from '../../lore/types'
import type { useMassRows } from '../../lore/useMassRows'
import { IconButton } from '../IconButton'

type Rows = ReturnType<typeof useMassRows>

/** A row's problem as a sentence, with the words the author pasted isolated in their own direction. */
function Problem({ problem }: { problem: RowProblem }) {
  const { tx } = useI18n()
  return (
    <>
      {tx(problem.key, {
        subject:
          problem.subject !== undefined ? (
            <>
              “<bdi>{problem.subject}</bdi>”
            </>
          ) : (
            ''
          ),
        max: problem.max ?? '',
      })}
    </>
  )
}

/** One row to create: its name, type and status, what is wrong with it, and Remove. */
export function MassCreateRow({
  row,
  index,
  id,
  choices,
  attempted,
  serverProblems,
  problems,
  repeats,
  controlId,
  updateRow,
  removeRow,
}: Pick<
  Rows,
  'attempted' | 'serverProblems' | 'problems' | 'repeats' | 'controlId' | 'updateRow' | 'removeRow'
> & { row: MassRow; index: number; id: string; choices: ReturnType<typeof typeChoices> }) {
  const { t } = useI18n()
  const number = index + 1
  const shown = (problems.get(row.key) ?? []).filter(
    (problem) => problem.field !== 'name' || row.touched || attempted,
  )
  const fromServer = serverProblems.get(row.key) ?? []
  const repeatOf = repeats.get(row.key)
  const messagesId = `${id}-messages-${row.key}`
  const hasMessages = shown.length > 0 || fromServer.length > 0 || repeatOf !== undefined
  const invalid = (field: RowField) =>
    shown.some((problem) => problem.field === field) ||
    fromServer.some((problem) => problem.field === field)
      ? true
      : undefined
  const described = hasMessages ? messagesId : undefined

  return (
    <li
      className="masscreate__row"
      data-state={
        shown.length > 0 || fromServer.length > 0
          ? 'invalid'
          : repeatOf !== undefined
            ? 'repeat'
            : undefined
      }
      data-testid="mass-row"
    >
      <span className="masscreate__number" aria-hidden="true">
        {number}
      </span>

      <div className="masscreate__cell masscreate__cell--name">
        <label className="masscreate__label visually-hidden" htmlFor={controlId('name', row.key)}>
          {t('lore.massCreate.rowName', { number })}
        </label>
        <input
          id={controlId('name', row.key)}
          className="field__input masscreate__input"
          dir="auto"
          value={row.name}
          onChange={(event) => updateRow(row.key, { name: event.target.value })}
          onBlur={() => {
            if (!row.touched) updateRow(row.key, { touched: true })
          }}
          aria-invalid={invalid('name')}
          aria-describedby={described}
          autoComplete="off"
          spellCheck={false}
          data-testid="mass-row-name"
        />
      </div>

      <div className="masscreate__cell masscreate__cell--type">
        <label className="masscreate__label visually-hidden" htmlFor={controlId('type', row.key)}>
          {t('lore.massCreate.rowType', { number })}
        </label>
        <select
          id={controlId('type', row.key)}
          className="field__input field__input--select masscreate__input"
          value={row.typeId ?? ''}
          onChange={(event) => updateRow(row.key, { typeId: event.target.value, typeText: '' })}
          aria-invalid={invalid('type')}
          aria-describedby={described}
          data-testid="mass-row-type"
        >
          {row.typeId === null ? (
            <option value="" disabled>
              {row.typeText
                ? t('lore.massCreate.unknown', { text: row.typeText })
                : t('lore.massCreate.chooseType')}
            </option>
          ) : null}
          {choices.map(({ type, label }) => (
            <option
              key={type.id}
              value={type.id}
              disabled={hasRequiredFields(type) && type.id !== row.typeId}
            >
              {hasRequiredFields(type) ? t('lore.massCreate.hasRequired', { label }) : label}
            </option>
          ))}
        </select>
      </div>

      <div className="masscreate__cell masscreate__cell--status">
        <label className="masscreate__label visually-hidden" htmlFor={controlId('status', row.key)}>
          {t('lore.massCreate.rowStatus', { number })}
        </label>
        <select
          id={controlId('status', row.key)}
          className="field__input field__input--select masscreate__input"
          value={row.status ?? ''}
          onChange={(event) =>
            updateRow(row.key, {
              status: Number(event.target.value) as CanonStatusValue,
              statusText: '',
            })
          }
          aria-invalid={invalid('status')}
          aria-describedby={described}
          data-testid="mass-row-status"
        >
          {row.status === null ? (
            <option value="" disabled>
              {row.statusText
                ? t('lore.massCreate.unknown', { text: row.statusText })
                : t('lore.massCreate.chooseStatus')}
            </option>
          ) : null}
          {CANON_ORDER.map((option) => (
            <option key={option} value={option}>
              {CANON_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <IconButton
        icon={X}
        label={
          row.name.trim()
            ? t('lore.massCreate.removeRowNamed', {
                number,
                name: row.name.trim(),
              })
            : t('lore.massCreate.removeRow', { number })
        }
        title={t('lore.massCreate.removeRowTitle')}
        className="masscreate__remove"
        id={controlId('remove', row.key)}
        onClick={() => removeRow(row.key)}
        data-testid="mass-row-remove"
      />

      {hasMessages ? (
        <ul className="masscreate__messages" id={messagesId} data-testid="mass-row-messages">
          {shown.map((problem) => (
            <li className="masscreate__problem" key={problem.field}>
              <Problem problem={problem} />
            </li>
          ))}
          {fromServer.map((problem) => (
            <li className="masscreate__problem" key={`server-${problem.field}`}>
              {problem.message}
            </li>
          ))}
          {repeatOf !== undefined ? (
            <li className="masscreate__warning">
              {t('lore.massCreate.repeat', { row: repeatOf })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

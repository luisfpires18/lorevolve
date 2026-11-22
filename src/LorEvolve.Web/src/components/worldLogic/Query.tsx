import { MAX_WHERE_CLAUSES, SOURCE_FIELDS, type Source } from '../../worldLogic/conditionSchema'
import { SOURCES, type JsonObject, type LiteralType } from '../../worldLogic/guard'
import { clauseOperators, newClause, withField } from '../../worldLogic/guardBlocks'
import { fieldType } from '../../worldLogic/guardClassify'
import { tg, select } from '../../worldLogic/guardBuilderKeys'
import { TypedValue } from './TypedValue'
import { Button } from '../Button'

/** A search over one source: the source, then up to eight clauses on its own fields. */
export function Query({
  query,
  onChange,
}: {
  query: JsonObject
  onChange: (next: JsonObject) => void
}) {
  const from = query.from as Source
  const where = query.where as JsonObject[]
  const setClause = (index: number, clause: JsonObject) =>
    onChange({ ...query, where: where.map((each, at) => (at === index ? clause : each)) })

  return (
    <div className="guardblock__query" data-testid="guard-query">
      <div className="guardblock__row">
        <select
          className={select}
          value={from}
          aria-label={tg('source')}
          // Another source has other fields, so its clauses cannot carry over.
          onChange={(event) => onChange({ ...query, from: event.target.value, where: [] })}
          data-testid="guard-source"
        >
          {SOURCES.map((each) => (
            <option key={each} value={each}>
              {tg(`sources.${each}`)}
            </option>
          ))}
        </select>
      </div>
      {where.map((clause, index) => {
        const field = String(clause.field)
        const type = fieldType(from, field)
        const operators: string[] = clauseOperators(from, field)
        const op = String(clause.op)
        const name = tg('clause', { number: index + 1 })
        return (
          <div
            className="guardblock__row guardblock__clause"
            role="group"
            aria-label={name}
            key={index}
            data-testid="guard-clause"
          >
            <select
              className={select}
              value={field}
              aria-label={`${name}, ${tg('field')}`}
              onChange={(event) => setClause(index, withField(clause, from, event.target.value))}
              data-testid="guard-clause-field"
            >
              {SOURCE_FIELDS[from].map((each) => (
                <option key={each} value={each}>
                  {tg(`fields.${from}.${each}`)}
                </option>
              ))}
            </select>
            <select
              className={select}
              value={op}
              aria-label={`${name}, ${tg('operator')}`}
              onChange={(event) => setClause(index, { ...clause, op: event.target.value })}
              data-testid="guard-clause-op"
            >
              {(operators.includes(op) ? operators : [...operators, op]).map((each) => (
                <option key={each} value={each}>
                  {tg(`ops.${each}`)}
                </option>
              ))}
            </select>
            {type === 'reference' ? (
              <span className="guardblock__fixed">{tg('operandKinds.self')}</span>
            ) : (
              <TypedValue
                type={type as LiteralType}
                value={clause.value}
                name={name}
                onChange={(value) => setClause(index, { ...clause, value })}
                testId="guard-clause"
              />
            )}
            <Button
              tone="text"
              size="sm"
              aria-label={tg('removeClause')}
              onClick={() => onChange({ ...query, where: where.filter((_, at) => at !== index) })}
              data-testid="guard-clause-remove"
            >
              {tg('remove')}
            </Button>
          </div>
        )
      })}
      <div className="guardblock__row">
        <Button
          tone="secondary"
          size="sm"
          disabled={where.length >= MAX_WHERE_CLAUSES}
          onClick={() => onChange({ ...query, where: [...where, newClause(from)] })}
          data-testid="guard-add-clause"
        >
          {tg('addClause')}
        </Button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { t } from '../i18n'
import {
  MAX_WHERE_CLAUSES,
  SOURCE_FIELDS,
  TIME_SCOPES,
  type Source,
} from '../worldLogic/conditionSchema'
import {
  BLOCK_KINDS,
  blockFor,
  blockPaths,
  classifyNode,
  classifyOperand,
  clauseOperators,
  compareOperators,
  fieldType,
  fixOperator,
  isObject,
  LITERAL_TYPES,
  newClause,
  newLiteral,
  newNode,
  newOperand,
  OPERAND_KINDS,
  pathKey,
  pointValueOf,
  scopeOf,
  setAt,
  SOURCES,
  summarize,
  withField,
  wrap,
  type BlockKind,
  type Json,
  type JsonObject,
  type LiteralType,
  type NewOperandKind,
  type Path,
  type Problem,
} from '../worldLogic/guard'

const g = 'canon.worldLogic.systems.machine.guardBuilder'

/** A message under `guardBuilder`, for keys built from the schema's own words. */
function tg(key: string, vars?: Record<string, string | number>) {
  return t(`${g}.${key}` as never, vars)
}

type Side = 'left' | 'right' | 'from' | 'to'

interface Context {
  problemsAt: (key: string) => Problem[]
  titleOf: (ruleId: string) => string | undefined
}

const select = 'field__input field__input--select'

/**
 * A condition built from blocks (Issue #359): groups of all or any, a not, and comparison, exists and related rows,
 * each drawn from the closed sets in `conditionSchema.ts`. A part the builder cannot edit is one read-only block with
 * its own summary, and it is never rebuilt: every edit spreads the node it changes, so whatever else it holds stays.
 *
 * Groups indent for four levels and then stop, saying their level instead, so a deep guard still fits a phone.
 */
export function GuardBuilder({
  condition,
  onChange,
  problems,
  titleOf,
  labelledBy,
}: {
  condition: Json
  onChange: (next: Json) => void
  problems: Problem[]
  titleOf: (ruleId: string) => string | undefined
  labelledBy?: string
}) {
  const blocks = blockPaths(condition)
  const byBlock = new Map<string, Problem[]>()
  for (const problem of problems) {
    const key = pathKey(blockFor(problem.path, blocks))
    byBlock.set(key, [...(byBlock.get(key) ?? []), problem])
  }
  const context: Context = { problemsAt: (key) => byBlock.get(key) ?? [], titleOf }
  const rootKind = classifyNode(condition)

  return (
    <div
      className="guardbuilder"
      role="group"
      aria-labelledby={labelledBy}
      data-testid="guard-builder"
    >
      <Block node={condition} path={[]} level={1} onChange={onChange} context={context} />
      {rootKind !== 'all' && rootKind !== 'any' ? (
        <div className="guardblock__row">
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => onChange(wrap(condition))}
            data-testid="guard-wrap"
          >
            {tg('wrap')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Block({
  node,
  path,
  level,
  onChange,
  onRemove,
  context,
}: {
  node: Json
  path: Path
  level: number
  onChange: (next: Json) => void
  onRemove?: () => void
  context: Context
}) {
  const kind = classifyNode(node)
  const key = pathKey(path)
  const problems = context.problemsAt(key)
  const isGroup = kind === 'all' || kind === 'any'
  const label = kind === 'readonly' ? tg('readOnly') : tg(`kinds.${kind}`)
  const classes = ['guardblock']
  if (level >= 2 && level <= 5) classes.push('guardblock--indent')
  if (!isGroup && kind !== 'not') classes.push('guardblock--leaf')

  return (
    <div
      className={classes.join(' ')}
      role="group"
      aria-label={label}
      tabIndex={-1}
      data-testid="guard-block"
      data-kind={kind}
      data-path={key}
    >
      <div className="guardblock__head">
        {isGroup ? (
          <select
            className={select}
            value={kind}
            aria-label={tg('groupKind')}
            onChange={(event) => onChange({ ...(node as JsonObject), kind: event.target.value })}
            data-testid="guard-group-kind"
          >
            <option value="all">{tg('kinds.all')}</option>
            <option value="any">{tg('kinds.any')}</option>
          </select>
        ) : (
          <span className="guardblock__kind">{label}</span>
        )}
        {isGroup && level > 5 ? (
          <span className="guardblock__level">
            {tg('levelled', { kind: tg(`kinds.${kind}`), level })}
          </span>
        ) : null}
        {onRemove ? (
          <button
            className="button button--text button--sm guardblock__remove"
            type="button"
            aria-label={tg('removeBlock')}
            onClick={onRemove}
            data-testid="guard-remove"
          >
            {tg('remove')}
          </button>
        ) : null}
      </div>

      {isGroup ? (
        <Group
          node={node as JsonObject}
          path={path}
          level={level}
          onChange={onChange}
          context={context}
        />
      ) : null}
      {kind === 'not' ? (
        <Block
          node={(node as JsonObject).of}
          path={[...path, 'of']}
          level={level + 1}
          onChange={(child) => onChange(setAt(node, ['of'], child))}
          context={context}
        />
      ) : null}
      {kind === 'compare' ? <Compare node={node as JsonObject} onChange={onChange} /> : null}
      {kind === 'exists' ? (
        <Query
          query={(node as JsonObject).query as JsonObject}
          onChange={(query) => onChange({ ...(node as JsonObject), query })}
        />
      ) : null}
      {kind === 'related' ? <Related node={node as JsonObject} onChange={onChange} /> : null}
      {kind === 'readonly' ? (
        <p className="guardblock__summary" dir="auto" data-testid="guard-summary">
          {(() => {
            const summary = summarize(node, context.titleOf)
            return tg(summary.key, summary.params)
          })()}
        </p>
      ) : null}

      {problems.map((problem, index) => (
        <p className="field__error" role="alert" key={index} data-testid="guard-block-error">
          {problem.message ?? tg(problem.key)}
        </p>
      ))}
    </div>
  )
}

function Group({
  node,
  path,
  level,
  onChange,
  context,
}: {
  node: JsonObject
  path: Path
  level: number
  onChange: (next: Json) => void
  context: Context
}) {
  const [adding, setAdding] = useState<BlockKind>('compare')
  const children = node.of as Json[]

  return (
    <>
      {children.length > 0 ? (
        <div className="guardblock__children">
          {children.map((child, index) => (
            <Block
              key={index}
              node={child}
              path={[...path, 'of', index]}
              level={level + 1}
              onChange={(next) => onChange(setAt(node, ['of', index], next))}
              onRemove={() => onChange({ ...node, of: children.filter((_, at) => at !== index) })}
              context={context}
            />
          ))}
        </div>
      ) : null}
      <div className="guardblock__row">
        <select
          className={select}
          value={adding}
          aria-label={tg('addBlock')}
          onChange={(event) => setAdding(event.target.value as BlockKind)}
          data-testid="guard-add-kind"
        >
          {BLOCK_KINDS.map((each) => (
            <option key={each} value={each}>
              {tg(`kinds.${each}`)}
            </option>
          ))}
        </select>
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={() => onChange({ ...node, of: [...children, newNode(adding)] })}
          data-testid="guard-add"
        >
          {tg('add')}
        </button>
      </div>
    </>
  )
}

function Compare({ node, onChange }: { node: JsonObject; onChange: (next: Json) => void }) {
  const operators = compareOperators(node.left, node.right)
  const op = String(node.op)
  // An operator written elsewhere is offered as it is, so opening a guard never changes it.
  const shown = operators.includes(op as never) ? operators : [...operators, op]
  const side = (name: 'left' | 'right') => (next: Json) =>
    onChange(fixOperator({ ...node, [name]: next }))

  return (
    <>
      <Operand value={node.left} side="left" onChange={side('left')} />
      <div className="guardblock__row">
        <select
          className={select}
          value={op}
          aria-label={tg('operator')}
          onChange={(event) => onChange({ ...node, op: event.target.value })}
          data-testid="guard-op"
        >
          {shown.map((each) => (
            <option key={each} value={each}>
              {tg(`ops.${each}`)}
            </option>
          ))}
        </select>
      </div>
      <Operand value={node.right} side="right" onChange={side('right')} />
    </>
  )
}

function Related({ node, onChange }: { node: JsonObject; onChange: (next: Json) => void }) {
  return (
    <>
      <div className="guardblock__row">
        <input
          className="field__input"
          type="text"
          dir="auto"
          value={String(node.relation)}
          placeholder={tg('placeholders.relation')}
          aria-label={tg('relation')}
          onChange={(event) => onChange({ ...node, relation: event.target.value })}
          data-testid="guard-relation"
        />
      </div>
      <Operand
        value={node.from}
        side="from"
        onChange={(from) => onChange({ ...node, from })}
        labelled
      />
      <Operand value={node.to} side="to" onChange={(to) => onChange({ ...node, to })} labelled />
    </>
  )
}

/** One side of a comparison or a relation: what kind of thing it is, then that thing's own controls. */
function Operand({
  value,
  side,
  onChange,
  labelled = false,
}: {
  value: Json | undefined
  side: Side
  onChange: (next: Json) => void
  labelled?: boolean
}) {
  const kind = classifyOperand(value) ?? 'kept'
  const operand = isObject(value) ? value : {}
  const name = tg(`sides.${side}`)
  const kinds: string[] = kind === 'kept' ? [...OPERAND_KINDS, 'kept'] : OPERAND_KINDS

  return (
    <div className="guardblock__slot" data-testid="guard-operand" data-side={side}>
      <div className="guardblock__row">
        {labelled ? <span className="guardblock__kind">{name}</span> : null}
        <select
          className={select}
          value={kind}
          aria-label={tg('slot.kind', { side: name })}
          onChange={(event) => onChange(newOperand(event.target.value as NewOperandKind))}
          data-testid="guard-operand-kind"
        >
          {kinds.map((each) => (
            <option key={each} value={each} disabled={each === 'kept'}>
              {tg(`operandKinds.${each}`)}
            </option>
          ))}
        </select>
        {kind === 'attribute' ? (
          <input
            className="field__input"
            type="text"
            dir="auto"
            value={String(operand.attribute)}
            placeholder={tg('placeholders.attribute')}
            aria-label={tg('slot.attribute', { side: name })}
            onChange={(event) => onChange({ ...operand, attribute: event.target.value })}
            data-testid="guard-attribute"
          />
        ) : null}
        {kind === 'literal' ? (
          <>
            <select
              className={select}
              value={String(operand.type)}
              aria-label={tg('slot.type', { side: name })}
              onChange={(event) =>
                onChange({ ...operand, ...newLiteral(event.target.value as LiteralType) })
              }
              data-testid="guard-literal-type"
            >
              {LITERAL_TYPES.map((each) => (
                <option key={each} value={each}>
                  {tg(`types.${each}`)}
                </option>
              ))}
            </select>
            <TypedValue
              type={operand.type as LiteralType}
              value={operand.literal}
              name={name}
              onChange={(literal) => onChange({ ...operand, literal })}
              testId="guard-literal"
            />
          </>
        ) : null}
      </div>
      {kind === 'count' ? (
        <Query
          query={operand.count as JsonObject}
          onChange={(count) => onChange({ ...operand, count })}
        />
      ) : null}
    </div>
  )
}

/** A value of one literal type: yes or no, a number, text, or a time point's scope and value. */
function TypedValue({
  type,
  value,
  name,
  onChange,
  testId,
}: {
  type: LiteralType
  value: Json | undefined
  name: string
  onChange: (next: Json) => void
  testId: string
}) {
  if (type === 'boolean') {
    return (
      <select
        className={select}
        value={value === false ? 'false' : 'true'}
        aria-label={tg('slot.value', { side: name })}
        onChange={(event) => onChange(event.target.value === 'true')}
        data-testid={`${testId}-boolean`}
      >
        <option value="true">{tg('yes')}</option>
        <option value="false">{tg('no')}</option>
      </select>
    )
  }
  if (type === 'number') {
    return <NumberInput value={value} name={name} onChange={onChange} testId={`${testId}-value`} />
  }
  if (type === 'timePoint') {
    const point = typeof value === 'string' ? value : ''
    const scope = scopeOf(point) || TIME_SCOPES[0]
    return (
      <>
        <select
          className={select}
          value={scope}
          aria-label={tg('slot.scope', { side: name })}
          onChange={(event) => onChange(`${event.target.value}:${pointValueOf(point)}`)}
          data-testid={`${testId}-scope`}
        >
          {TIME_SCOPES.map((each) => (
            <option key={each} value={each}>
              {tg(`scopes.${each}`)}
            </option>
          ))}
        </select>
        <input
          className="field__input"
          type="text"
          dir="auto"
          value={pointValueOf(point)}
          placeholder={tg('placeholders.value')}
          aria-label={tg('slot.value', { side: name })}
          onChange={(event) => onChange(`${scope}:${event.target.value}`)}
          data-testid={`${testId}-value`}
        />
      </>
    )
  }
  return (
    <input
      className="field__input"
      type="text"
      dir="auto"
      value={typeof value === 'string' ? value : ''}
      placeholder={tg('placeholders.value')}
      aria-label={tg('slot.value', { side: name })}
      onChange={(event) => onChange(event.target.value)}
      data-testid={`${testId}-value`}
    />
  )
}

/**
 * A number typed as text: a value that reads as a number is stored as one, anything else is kept as the text so the
 * author sees what they typed, and the save is held until it is a number.
 */
function NumberInput({
  value,
  name,
  onChange,
  testId,
}: {
  value: Json | undefined
  name: string
  onChange: (next: Json) => void
  testId: string
}) {
  const [text, setText] = useState(String(value ?? ''))
  // The typed text while it still reads as the stored number ("1." is 1), else the stored value itself.
  const shown =
    typeof value === 'string'
      ? value
      : text.trim() !== '' && Number(text) === value
        ? text
        : String(value ?? '')

  return (
    <input
      className="field__input"
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder={tg('placeholders.number')}
      aria-label={tg('slot.value', { side: name })}
      onChange={(event) => {
        const next = event.target.value
        const number = Number(next)
        setText(next)
        onChange(next.trim() !== '' && Number.isFinite(number) ? number : next)
      }}
      data-testid={testId}
    />
  )
}

/** A search over one source: the source, then up to eight clauses on its own fields. */
function Query({ query, onChange }: { query: JsonObject; onChange: (next: JsonObject) => void }) {
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
            <button
              className="button button--text button--sm"
              type="button"
              aria-label={tg('removeClause')}
              onClick={() => onChange({ ...query, where: where.filter((_, at) => at !== index) })}
              data-testid="guard-clause-remove"
            >
              {tg('remove')}
            </button>
          </div>
        )
      })}
      <div className="guardblock__row">
        <button
          className="button button--secondary button--sm"
          type="button"
          disabled={where.length >= MAX_WHERE_CLAUSES}
          onClick={() => onChange({ ...query, where: [...where, newClause(from)] })}
          data-testid="guard-add-clause"
        >
          {tg('addClause')}
        </button>
      </div>
    </div>
  )
}

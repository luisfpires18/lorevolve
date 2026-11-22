import { useState } from 'react'
import {
  BLOCK_KINDS,
  setAt,
  type BlockKind,
  type Json,
  type JsonObject,
  type Path,
} from '../../worldLogic/guard'
import { newNode } from '../../worldLogic/guardBlocks'
import { classifyNode } from '../../worldLogic/guardClassify'
import { pathKey } from '../../worldLogic/guardPaths'
import { summarize } from '../../worldLogic/guardSummary'
import { tg, select, type Context } from '../../worldLogic/guardBuilderKeys'
import { Compare } from './Compare'
import { Related } from './Related'
import { Query } from './Query'
import { Button } from '../Button'

export function Block({
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
          <Button
            tone="text"
            size="sm"
            className="guardblock__remove"
            aria-label={tg('removeBlock')}
            onClick={onRemove}
            data-testid="guard-remove"
          >
            {tg('remove')}
          </Button>
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

export function Group({
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
        <Button
          tone="secondary"
          size="sm"
          onClick={() => onChange({ ...node, of: [...children, newNode(adding)] })}
          data-testid="guard-add"
        >
          {tg('add')}
        </Button>
      </div>
    </>
  )
}

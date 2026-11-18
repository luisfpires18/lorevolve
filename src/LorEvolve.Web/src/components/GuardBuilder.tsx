import type { Json, Problem } from '../worldLogic/guard'
import { wrap } from '../worldLogic/guardBlocks'
import { classifyNode } from '../worldLogic/guardClassify'
import { blockFor, blockPaths, pathKey } from '../worldLogic/guardPaths'
import { tg, type Context } from '../worldLogic/guardBuilderKeys'
import { Block } from './worldLogic/Block'

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

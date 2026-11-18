import type { Json, JsonObject } from '../../worldLogic/guard'
import { tg } from '../../worldLogic/guardBuilderKeys'
import { Operand } from './Operand'

export function Related({ node, onChange }: { node: JsonObject; onChange: (next: Json) => void }) {
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

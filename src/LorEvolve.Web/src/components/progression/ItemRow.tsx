import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RowMenu } from '../RowMenu'
import { MoveItems } from '../MoveItems'
import type { EraScene } from '../../progression/types'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

/** One fact under a row: the term, the words, and the test id on the value. */
export interface ItemFact {
  name: string
  value: string
  testId: string
}

/**
 * One form, ability or appearance on the main profile: its name, the actions menu, what the author said of it,
 * whatever the row adds (an appearance's gallery), its facts and the scenes it is used in.
 */
export function ItemRow({
  kind,
  name,
  description,
  universeId,
  first,
  last,
  busy,
  canEdit,
  words,
  facts,
  scenes,
  onEdit,
  onMove,
  onRemove,
  children,
}: {
  kind: 'form' | 'ability' | 'appearance'
  name: string
  description: string | null
  universeId: string
  first: boolean
  last: boolean
  busy: boolean
  canEdit: boolean
  words: {
    actions: string
    edit: string
    remove: string
    scenes: string
    sceneInTrash: (title: string) => string
  }
  facts: ItemFact[]
  scenes: EraScene[]
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
  /** Shown under the description: an appearance's upload message, gallery and picture viewer. */
  children?: ReactNode
}) {
  return (
    <li className="progitems__item" data-testid={`${kind}-${name}`}>
      <div className="progitems__head">
        <h4 className="progitems__name">
          <bdi>{name}</bdi>
        </h4>
        {canEdit ? (
          <RowMenu
            label={words.actions}
            triggerTestId={`${kind}-actions-${name}`}
            busy={busy}
            onEdit={onEdit}
            editLabel={words.edit}
            editTestId={`edit-${kind}`}
            onRemove={onRemove}
            removeLabel={words.remove}
            removeTestId={`remove-${kind}`}
          >
            <MoveItems
              first={first}
              last={last}
              busy={busy}
              wording="earlier-later"
              onMove={onMove}
            />
          </RowMenu>
        ) : null}
      </div>
      {description ? <p className="progitems__description prose">{description}</p> : null}
      {children}
      {facts.length > 0 || scenes.length > 0 ? (
        <FactList look="inline">
          {facts.map((fact) => (
            <Fact name={fact.name} key={fact.testId} valueTestId={fact.testId}>
              {fact.value}
            </Fact>
          ))}
          {scenes.length > 0 ? (
            <Fact name={words.scenes}>
              <ul className="eracovers">
                {scenes.map((scene) => (
                  <li key={scene.id}>
                    {scene.isTrashed ? (
                      <span>{words.sceneInTrash(scene.title)}</span>
                    ) : (
                      <Link
                        to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                      >
                        {scene.title}
                      </Link>
                    )}
                    <span> · {scene.storyTitle}</span>
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
        </FactList>
      ) : null}
    </li>
  )
}

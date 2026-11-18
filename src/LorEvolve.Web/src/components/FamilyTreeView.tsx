import { useEffect } from 'react'
import { FamilyMemberDetails } from './FamilyMemberDetails'
import type { FamilyTree } from '../familyTree/types'
import type { FamilyTreeConnection } from '../familyTree/types'
import { useI18n } from '../i18n'
import { useFamilyTreeLines } from '../familyTree/useFamilyTreeLines'
import { useFamilyTreeViewState } from '../familyTree/useFamilyTreeViewState'
import { FamilyTreeLegend } from './familyTree/FamilyTreeLegend'
import { FamilyTreeRows } from './familyTree/FamilyTreeRows'

interface Props {
  universeId: string
  tree: FamilyTree
  onFocus: (entityId: string) => void
}

/**
 * A family, drawn as generations rather than as a graph: grandparents and parents above, the focal entry and
 * its siblings in the middle, children and grandchildren below.
 *
 * Each member is a portrait in a circle with the name beneath (Issue #37). Everything else a member's old card
 * carried - its type, its Canon status, every position it holds and the links that put it there, and the family
 * its author recorded that is not parentage - is one press away on the eye, in `FamilyMemberDetails`. The portrait
 * takes the focus to that member's family, as the card's name did.
 *
 * Couples stand side by side, joined by a short line, and their children hang from one stem between them, so siblings
 * are read from the bar they share rather than from lines of their own (`arrangeFamily`). Recorded family that joins no
 * couple - a guardian, a betrothal, a sibling link between siblings - has no permanent line: pointing at or focusing a
 * member draws theirs, and the caption beneath writes them out. No line carries words.
 *
 * The lines are decoration - they are measured from the members and drawn in an `aria-hidden` SVG - so the
 * structure a screen reader or a keyboard follows is the row headings, the lists, the caption and the details, where
 * every position and every link is written out in words.
 */
export function FamilyTreeView({ universeId, tree, onFocus }: Props) {
  const { t } = useI18n()
  const viewState = useFamilyTreeViewState({ tree })
  const {
    family,
    layout,
    scroller,
    canvas,
    focalCard,
    cards,
    edges,
    size,
    setHovered,
    setFocused,
    setOpen,
    shown,
    pointed,
  } = viewState

  useFamilyTreeLines({ ...viewState, tree })

  // A wide family scrolls sideways inside its own box; the entry being looked at starts in view. Only that box
  // moves - scrolling the member into view would move the page under the reader as well.
  useEffect(() => {
    const box = scroller.current
    const card = focalCard.current
    if (!box || !card || box.scrollWidth <= box.clientWidth) return
    const offset = card.getBoundingClientRect().left - box.getBoundingClientRect().left
    box.scrollLeft += offset - (box.clientWidth - card.offsetWidth) / 2
  }, [tree.focalEntityId])

  const focal = family.focal
  const caption = pointed
    ? tree.connections
        .filter((connection) => connection.entityId === pointed)
        .map((connection) => sentence(connection))
    : []

  function sentence(connection: FamilyTreeConnection) {
    const from = family.nodes.get(connection.entityId)?.name ?? ''
    const to = family.nodes.get(connection.relatedEntityId)?.name ?? ''
    return t('places.treeView.connection', {
      from,
      label: `${connection.label.charAt(0).toLowerCase()}${connection.label.slice(1)}`,
      to,
    })
  }

  return (
    <div className="familytree" data-testid="family-tree">
      <div className="familytree__scroll" ref={scroller}>
        <div className="familytree__canvas" ref={canvas}>
          <svg
            className="familytree__lines"
            aria-hidden="true"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          >
            {edges.map((edge) => (
              <path
                key={edge.id}
                className="familytree__line"
                d={edge.d}
                data-part={edge.part}
                data-semantic={edge.semantic}
                data-canon={edge.canonStatus}
              />
            ))}
          </svg>

          <FamilyTreeRows
            layout={layout}
            family={family}
            focal={focal}
            tree={tree}
            universeId={universeId}
            shown={shown}
            focalCard={focalCard}
            register={register}
            setHovered={setHovered}
            setFocused={setFocused}
            setOpen={setOpen}
            onFocus={onFocus}
          />
        </div>
      </div>

      <FamilyTreeLegend caption={caption} />

      {shown ? (
        <FamilyMemberDetails
          key={shown.entityId}
          universeId={universeId}
          tree={tree}
          family={family}
          entityId={shown.entityId}
          anchor={shown.anchor}
          onClose={() => setOpen(null)}
          onFocus={onFocus}
        />
      ) : null}
    </div>
  )

  function register(entityId: string, element: HTMLLIElement | null) {
    if (element) cards.current.set(entityId, element)
    else cards.current.delete(entityId)
  }
}

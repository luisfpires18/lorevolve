import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { EmptyState } from './EmptyState'
import { PlotArcForm } from './PlotArcForm'
import { PlotArcSection } from './PlotArcSection'
import { PlotBeatForm } from './PlotBeatForm'
import { PlotBeatItem } from './PlotBeatItem'
import { ApiError } from '../lib/api'
import { deletePlotArc, deletePlotBeat, reorderPlotArcs, reorderPlotBeats } from '../stories/api'
import { arcLabel, arcNumber, beatCountLabel } from '../stories/format'
import type { PlotArc, PlotBeat, StoryDetail } from '../stories/types'
import { confirmAction } from '../lib/confirm'

type ArcFormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; arc: PlotArc; index: number }

type BeatFormState =
  { mode: 'closed' } | { mode: 'new'; arcId: string } | { mode: 'edit'; beat: PlotBeat }

interface PlotPanelProps {
  universeId: string
  /** The story whose plot this is. Its chapters and scenes name what each beat links. */
  story: StoryDetail
  /** The story's arcs, in order, each with its beats in order. */
  arcs: PlotArc[]
  /** Shows a plot on screen at once - before a save lands, and again when it has. */
  onArcsChange: (arcs: PlotArc[]) => void
  /** Reads the story and its plot again, after a write that changed more than one place. */
  onReload: () => void
  /** Says what just happened, through the story page's one live region. */
  announce: (message: string) => void
  /** Each arc's publication control, built by the story page, which knows whether the story is public. */
  arcPublication?: (arc: PlotArc) => ReactNode
}

/**
 * A story's plot: the threads its author follows, and the steps in each.
 *
 * Arcs are headings and beats are rows beneath them - one level of hierarchy and no card around cards, because a plot
 * is planning to scan, not a board to arrange. Move up and Move down reorder an arc among the arcs, or a beat inside
 * its arc; a beat changes arc from its form. Neither order follows the order scenes are told in, their chapters or
 * when anything happens in the world, and nothing written here becomes a fact about it.
 *
 * Laid out like the Scenes view: the view's own tools and a line on how it is ordered, or - with nothing planned yet -
 * one empty state holding the one way to begin.
 */
export function PlotPanel({
  universeId,
  story,
  arcs,
  onArcsChange,
  onReload,
  announce,
  arcPublication,
}: PlotPanelProps) {
  const access = useUniverseAccess()
  const [arcForm, setArcForm] = useState<ArcFormState>({ mode: 'closed' })
  const [beatForm, setBeatForm] = useState<BeatFormState>({ mode: 'closed' })
  const [message, setMessage] = useState<string | null>(null)

  const isMoving = useRef(false)
  // The ⋯ menu of whatever has just moved, found again once the plot is redrawn: the move was made from that menu, and
  // moving the row in the page can take the focus off it.
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    const selector = pendingFocus.current
    if (!selector) return
    pendingFocus.current = null
    document.querySelector<HTMLElement>(selector)?.focus()
  }, [arcs])

  /** Moves one arc one place, at once on screen, and puts it back if refused. */
  async function moveArc(arc: PlotArc, by: -1 | 1) {
    if (isMoving.current) return

    const from = arcs.findIndex((candidate) => candidate.id === arc.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= arcs.length) return

    const next = [...arcs]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    const previous = arcs
    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#arc-${arc.id} [data-testid="plot-arc-actions"]`
    onArcsChange(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      onArcsChange(
        await reorderPlotArcs(
          universeId,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      announce(`“${arc.title}” is now arc ${to + 1} of ${next.length}.`)
    } catch (error: unknown) {
      onArcsChange(previous)
      setMessage(error instanceof ApiError ? error.message : 'The new order could not be saved.')
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one beat one place inside its arc, at once on screen, and puts it back if refused. */
  async function moveBeat(arc: PlotArc, arcIndex: number, beat: PlotBeat, by: -1 | 1) {
    if (isMoving.current) return

    const from = arc.beats.findIndex((candidate) => candidate.id === beat.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= arc.beats.length) return

    const next = [...arc.beats]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    const previous = arcs
    const withBeats = (beats: PlotBeat[]) =>
      previous.map((candidate) => (candidate.id === arc.id ? { ...candidate, beats } : candidate))

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#beat-${beat.id} [data-testid="plot-beat-actions"]`
    onArcsChange(withBeats(next.map((candidate, index) => ({ ...candidate, sortOrder: index }))))

    try {
      onArcsChange(
        withBeats(
          await reorderPlotBeats(
            universeId,
            story.id,
            arc.id,
            next.map((candidate) => candidate.id),
          ),
        ),
      )
      announce(
        `“${beat.title}” is now beat ${to + 1} of ${next.length} in ${arcLabel(arcIndex, arc.title)}.`,
      )
    } catch (error: unknown) {
      onArcsChange(previous)
      setMessage(error instanceof ApiError ? error.message : 'The new order could not be saved.')
    } finally {
      isMoving.current = false
    }
  }

  /** Moves the arc and its beats to the Trash. No scene, chapter or entry goes with them. */
  async function removeArc(arc: PlotArc, index: number) {
    const count = arc.beats.length
    const consequence =
      count === 0 ? 'It holds no beats.' : `Its ${beatCountLabel(count)} will go with it.`

    setMessage(null)
    const removed = await confirmAction({
      title: `Delete ${arcLabel(index, arc.title)}?`,
      message: `The arc will be removed. ${consequence} No scene, chapter or lore is deleted. You can restore the arc from the Trash.`,
      confirmLabel: 'Move arc to Trash',
      busyLabel: 'Moving…',
      variant: 'warning',
      failure: 'That arc could not be deleted.',
      action: () => deletePlotArc(universeId, story.id, arc.id),
    })
    if (!removed) return
    announce(`Moved the arc “${arc.title}” to the Trash.`)
    onReload()
  }

  async function removeBeat(beat: PlotBeat) {
    setMessage(null)
    const removed = await confirmAction({
      title: (
        <>
          Delete the beat “<bdi>{beat.title}</bdi>”?
        </>
      ),
      message: 'Its linked scenes and lore stay. You can restore the beat from the Trash.',
      confirmLabel: 'Move beat to Trash',
      busyLabel: 'Moving…',
      variant: 'warning',
      failure: 'That beat could not be deleted.',
      action: () => deletePlotBeat(universeId, story.id, beat.id),
    })
    if (!removed) return
    announce(`Moved the beat “${beat.title}” to the Trash.`)
    onReload()
  }

  const newArc = (
    <button
      className="button"
      type="button"
      onClick={() => setArcForm({ mode: 'new' })}
      data-testid="new-plot-arc"
    >
      <ActionIcon icon={Plus} />
      New arc
    </button>
  )

  return (
    <section className="plot" aria-labelledby="story-plot-heading" data-testid="plot">
      <h2 className="visually-hidden" id="story-plot-heading">
        Plot
      </h2>

      {arcs.length > 0 ? (
        <div className="story__toolbar">
          <p className="chron__aside story__aside">
            Arcs in the order you plan them, and the beats in each. Neither follows the order scenes
            are told in or when they happen.
          </p>
          {access.editContent ? (
            <div className="story__toolbaractions">
              <span className="story__create">{newArc}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="plot-error">
          {message}
        </p>
      ) : null}

      {arcs.length === 0 ? (
        <EmptyState
          testId="plot-empty"
          title="No arcs yet."
          hint={
            <>
              An arc is a thread you follow through the story; its beats are the steps, and each can
              point at the scenes it plays out in.
              {story.scenes.length === 0 ? (
                <>
                  {' '}
                  Most stories start with a scene:{' '}
                  <Link
                    to={`/app/universes/${universeId}/stories/${story.id}`}
                    data-testid="plot-empty-scenes"
                  >
                    add one on the Scenes view
                  </Link>
                  . A beat needs none.
                </>
              ) : null}
            </>
          }
          action={access.editContent ? newArc : undefined}
        />
      ) : null}

      {arcs.map((arc, arcIndex) => (
        <PlotArcSection
          key={arc.id}
          arc={arc}
          index={arcIndex}
          count={arcs.length}
          onMove={(target, by) => void moveArc(target, by)}
          onAddBeat={(target) => setBeatForm({ mode: 'new', arcId: target.id })}
          onEdit={(target, at) => setArcForm({ mode: 'edit', arc: target, index: at })}
          onDelete={(target, at) => void removeArc(target, at)}
          publication={arcPublication?.(arc)}
        >
          <ol className="beats" data-testid="plot-arc-beats">
            {arc.beats.map((beat, beatIndex) => (
              <PlotBeatItem
                key={beat.id}
                universeId={universeId}
                storyId={story.id}
                beat={beat}
                index={beatIndex}
                count={arc.beats.length}
                scenes={story.scenes}
                chapters={story.chapters}
                onMove={(target, by) => void moveBeat(arc, arcIndex, target, by)}
                onEdit={(target) => setBeatForm({ mode: 'edit', beat: target })}
                onDelete={(target) => void removeBeat(target)}
              />
            ))}
          </ol>
        </PlotArcSection>
      ))}

      {arcForm.mode !== 'closed' ? (
        <PlotArcForm
          universeId={universeId}
          storyId={story.id}
          arc={arcForm.mode === 'edit' ? arcForm.arc : null}
          number={arcForm.mode === 'edit' ? arcNumber(arcForm.index) : null}
          onClose={() => setArcForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setArcForm({ mode: 'closed' })
            announce(`Saved the arc “${saved.title}”.`)
            onReload()
          }}
        />
      ) : null}

      {beatForm.mode !== 'closed' ? (
        <PlotBeatForm
          universeId={universeId}
          storyId={story.id}
          beat={beatForm.mode === 'edit' ? beatForm.beat : null}
          arcs={arcs}
          arcId={beatForm.mode === 'new' ? beatForm.arcId : beatForm.beat.plotArcId}
          chapters={story.chapters}
          scenes={story.scenes}
          onClose={() => setBeatForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setBeatForm({ mode: 'closed' })
            announce(`Saved the beat “${saved.title}”.`)
            onReload()
          }}
        />
      ) : null}
    </section>
  )
}

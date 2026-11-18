import { useUniverseAccess } from '../universes/access'
import { useOutletContext } from 'react-router-dom'
import { TimelineEntryForm } from '../components/TimelineEntryForm'
import { t, useI18n } from '../i18n'
import { groupTimeline } from '../timeline/format'
import type { WorkspaceContext } from './UniverseWorkspace'
import { useTimelineState } from '../timeline/useTimelineState'
import { useTimelineSearch } from '../timeline/useTimelineSearch'
import { useTimelineReads } from '../timeline/useTimelineReads'
import { timelineActions } from '../timeline/timelineActions'
import { TimelineHeader } from '../components/timeline/TimelineHeader'
import { TimelineControls } from '../components/timeline/TimelineControls'
import { TimelineNotices } from '../components/timeline/TimelineNotices'
import { TimelineStream } from '../components/timeline/TimelineStream'
import { TimelineEmpty } from '../components/timeline/TimelineEmpty'

/**
 * The universe's one timeline: the moments written here, every dated scene of every live story, and every live entry's birth
 * and death year, in the order they happen in the world. Only a moment is edited here; a scene or an entry is opened where it
 * lives, and its item follows whatever is saved there.
 *
 * A story's timeline is this same page with `?story=`: its dated scenes and the moments linked to it. Every filter, the
 * search and the page are in the address, so Back, a reload and a shared link all land where the reader was. Following an
 * entry ("Taking part") is the one choice kept on the page, as it always was.
 */
export default function TimelinePage() {
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const { universe, chronology } = useOutletContext<WorkspaceContext>()

  const timeline = useTimelineState()
  const {
    storyId,
    sourceParam,
    canonStatus,
    search,
    page,
    participant,
    setParticipant,
    typed,
    setTyped,
    stories,
    state,
    setState,
    form,
    setForm,
    message,
  } = timeline
  const { update } = useTimelineSearch(timeline)
  const { forgetMoment, reload } = useTimelineReads({ ...timeline, universe })

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered =
    sourceParam !== null ||
    canonStatus !== null ||
    participant !== null ||
    search.trim() !== '' ||
    storyId !== null
  const story = storyId ? (stories?.find((candidate) => candidate.id === storyId) ?? null) : null
  const storyPath = (id: string) => `/app/universes/${universe.id}/stories/${id}`

  const { closeForm, remove } = timelineActions({
    ...timeline,
    universe,
    tx,
    result,
    update,
    reload,
    forgetMoment,
  })

  const { groups, unreckoned, unplaced, mixedEras } = groupTimeline(result?.items ?? [], chronology)

  return (
    <article className="chron">
      <TimelineHeader access={access} setForm={setForm} />

      <TimelineControls
        universe={universe}
        typed={typed}
        setTyped={setTyped}
        storyId={storyId}
        stories={stories}
        story={story}
        sourceParam={sourceParam}
        canonStatus={canonStatus}
        participant={participant}
        setParticipant={setParticipant}
        page={page}
        update={update}
      />

      <TimelineNotices
        storyId={storyId}
        story={story}
        stories={stories}
        storyPath={storyPath}
        update={update}
        sourceParam={sourceParam}
        canonStatus={canonStatus}
        mixedEras={mixedEras}
        message={message}
        state={state}
        setState={setState}
        reload={reload}
      />

      {result && result.items.length > 0 ? (
        <TimelineStream
          groups={groups}
          unreckoned={unreckoned}
          unplaced={unplaced}
          chronology={chronology}
          access={access}
          setForm={setForm}
          remove={remove}
          universe={universe}
          storyPath={storyPath}
        />
      ) : null}

      {result && result.items.length === 0 ? (
        <TimelineEmpty
          storyId={storyId}
          isFiltered={isFiltered}
          access={access}
          setForm={setForm}
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('time.timeline.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => update({ page: String(result.page - 1) })}
          >
            {t('time.timeline.previous')}
          </button>
          <span className="pager__position">
            {t('time.timeline.page', { page: result.page, total: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => update({ page: String(result.page + 1) })}
          >
            {t('time.timeline.next')}
          </button>
        </nav>
      ) : null}

      {form.mode !== 'closed' ? (
        <TimelineEntryForm
          universeId={universe.id}
          entry={form.mode === 'edit' ? form.entry : null}
          chronology={chronology}
          // A new moment started from a story's timeline starts linked to that story.
          initialStories={
            form.mode === 'new' && story
              ? [{ storyId: story.id, title: story.title, isTrashed: false }]
              : []
          }
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            reload()
          }}
        />
      ) : null}
    </article>
  )
}

import { useEffect } from 'react'
import { EntityMultiPicker } from './EntityMultiPicker'
import { CanonBlockNotice } from './CanonBlockNotice'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { t, useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { Drawer } from './Drawer'
import { useValidationTerms } from '../ruleValidation/useValidationTerms'
import { DateKind, type TimelineEntry, type TimelineStoryLink } from '../timeline/types'
import { inputOf } from '../timeline/momentDraft'
import { useMomentFormState } from '../timeline/useMomentFormState'
import { momentFormActions } from '../timeline/momentFormActions'
import { MomentBasics } from './timeline/MomentBasics'
import { MomentDating } from './timeline/MomentDating'
import { MomentDetails } from './timeline/MomentDetails'
import { StoryLinks } from './timeline/StoryLinks'
import { FormActions } from './FormActions'

interface TimelineEntryFormProps {
  universeId: string
  /** The moment being changed, or null when one is being written for the first time. */
  entry: TimelineEntry | null
  /** How this universe keeps time. With eras, every dated moment says which one it is in. */
  chronology: Chronology
  /** The stories a new moment starts linked to: the story whose timeline it was started from. Ignored for an existing one. */
  initialStories?: TimelineStoryLink[]
  onClose: () => void
  onSaved: () => void
}

/**
 * A drawer over the chronology rather than a page of its own: the moments stay visible
 * behind it, so an author can see where the one they are writing will land.
 *
 * Only the components the chosen kind allows are shown, and switching kind clears the
 * ones it forbids, so the form can never send a shape the API is bound to refuse.
 *
 * On a universe that names its eras, each year is chosen with its era beside it and the
 * free-text label of the plain reckoning is gone. On one that names none, the form is exactly
 * what it always was.
 *
 * Validation details sit folded at the foot (ADR 0034): an ordinary moment never needs them, and nothing in them is filled in
 * from the title, the description or who took part.
 */
export function TimelineEntryForm({
  universeId,
  entry,
  chronology,
  initialStories = [],
  onClose,
  onSaved,
}: TimelineEntryFormProps) {
  useI18n()
  const state = useMomentFormState({ entry, initialStories })
  const {
    title,
    initial,
    draft,
    fieldErrors,
    message,
    blocked,
    isSaving,
    detailsOpen,
    setDetailsOpen,
  } = state
  const {
    terms,
    failed: termsFailed,
    add: addTerm,
    reload: reloadTerms,
  } = useValidationTerms(universeId)

  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const isDirty =
    payloadKey(inputOf(draft, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, reckonsInEras, custom))
  useEffect(() => {
    // Left alone, the browser hands the focus to the scrolling body, which then wears a
    // focus ring across the whole panel. The title is where the writing starts anyway.
    title.current?.focus()
  }, [])

  const { edit, setComponent, chooseKind, save } = momentFormActions({
    ...state,
    universeId,
    entry,
    onSaved,
    reckonsInEras,
    custom,
  })

  const isRange = draft.dateKind === DateKind.Range
  const isDated = draft.dateKind !== DateKind.Unknown
  const detailCount = [draft.eventKindId, draft.methodId, draft.participant].filter(Boolean).length

  return (
    <Drawer
      testId="moment-form"
      titleId="moment-heading"
      // A new moment's title already says so; the eyebrow names only what is being edited.
      eyebrow={entry ? t('time.momentForm.eyebrow') : null}
      title={entry ? entry.title || t('time.momentForm.untitled') : t('time.momentForm.newMoment')}
      isDirty={isDirty}
      leaveMessage={
        entry
          ? t('time.momentForm.leaveGuardEdit', { title: entry.title })
          : t('time.momentForm.leaveGuardNew')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={entry ? t('time.momentForm.save') : t('time.momentForm.create')}
          busy={isSaving}
          busyLabel={entry ? t('time.momentForm.saving') : t('time.momentForm.adding')}
          submitTestId="save-moment"
          onCancel={close}
          cancelTestId="cancel-moment"
        />
      )}
    >
      {blocked ? (
        <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="moment-error">
          {message}
        </p>
      ) : null}

      <MomentBasics title={title} draft={draft} edit={edit} fieldErrors={fieldErrors} />

      <MomentDating
        chronology={chronology}
        reckonsInEras={reckonsInEras}
        draft={draft}
        edit={edit}
        setComponent={setComponent}
        chooseKind={chooseKind}
        fieldErrors={fieldErrors}
        isRange={isRange}
        isDated={isDated}
      />

      <EntityMultiPicker
        label={t('time.momentForm.entities')}
        hint={t('time.momentForm.entitiesHint')}
        universeId={universeId}
        value={draft.entities}
        onChange={(entities) => edit({ entities })}
        error={fieldErrors.entityids}
      />

      <StoryLinks
        universeId={universeId}
        value={draft.stories}
        onChange={(stories) => edit({ stories })}
        error={fieldErrors.storyids}
      />

      <MomentDetails
        universeId={universeId}
        entry={entry}
        draft={draft}
        edit={edit}
        fieldErrors={fieldErrors}
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        detailCount={detailCount}
        terms={terms}
        termsFailed={termsFailed}
        addTerm={addTerm}
        reloadTerms={reloadTerms}
      />
    </Drawer>
  )
}

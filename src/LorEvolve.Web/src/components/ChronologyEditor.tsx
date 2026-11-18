import { Plus } from 'lucide-react'
import { Field } from './Field'
import { EmptyState } from './EmptyState'
import { SaveAction } from './SaveAction'
import { CanonBlockNotice } from './CanonBlockNotice'
import type { Chronology } from '../chronology/types'
import { t, tn, useI18n } from '../i18n'
import { useLeaveGuard } from '../lib/leaveGuard'
import { PageHeader } from './PageHeader'
import { draftsFrom, inputOf } from '../chronology/eraDrafts'
import { useChronologyEditorState } from '../chronology/useChronologyEditorState'
import { useFocusNewEra } from '../chronology/useFocusNewEra'
import { chronologyActions } from '../chronology/chronologyActions'
import { ChronologyUnplaced } from './chronology/ChronologyUnplaced'
import { ChronologyEraRow } from './chronology/ChronologyEraRow'
import { Button } from './Button'

interface ChronologyEditorProps {
  universeId: string
  chronology: Chronology
  onSaved: (next: Chronology) => void
}

/**
 * Where a universe's date periods are named, ordered and turned the right way round - the Chronology section, head and
 * body. No periods is plain numbered years, and says so; the first period is one button away.
 *
 * It draws the page's own `PageHeader`, as every worldbuilding section does, because the header's primary action - Add
 * date period - is this editor's: the drafts live here. A new period's name takes the focus, since the button that made
 * it sits at the head of the page and the row appears below.
 *
 * A period is unbounded: its years count up from 1, or down to 1, as far as the author's dates go. Nothing here shows a
 * range - the example year of 10 only shows how a date is written. (The preview before 018 drew "BF 120, BF 1, AF 1,
 * AF 120" from a hard-coded sample, and read as a 120-year limit that never existed.)
 *
 * The whole list is saved at once, so reordering two periods is one change rather than a moment where both sit in the
 * same place. A period something is dated in cannot be removed here - the button says why rather than letting the API
 * refuse it - and a change that would make settled canon contradict itself comes back as the same refusal every gated
 * form shows.
 */
export function ChronologyEditor({ universeId, chronology, onSaved }: ChronologyEditorProps) {
  useI18n()
  const state = useChronologyEditorState({ universeId, chronology, onSaved })
  const {
    stored,
    drafts,
    fieldErrors,
    message,
    blocked,
    saving,
    saves,
    moved,
    statusId,
    headingId,
  } = state

  const dirty = JSON.stringify(inputOf(drafts)) !== JSON.stringify(inputOf(draftsFrom(stored)))
  // Periods put back as they were read clean; a failed save leaves the draft, and the question, standing.
  useLeaveGuard(dirty ? t('time.periods.leaveGuard') : null)

  useFocusNewEra({ focusNew: state.focusNew, drafts })

  const { change, update, move, add, discard, save } = chronologyActions({
    ...state,
    universeId,
    onSaved,
  })

  const unplacedParts = [
    stored.unplacedMomentCount > 0
      ? tn('time.periods.counts.timelineMoments', stored.unplacedMomentCount, {
          n: stored.unplacedMomentCount,
        })
      : null,
    stored.unplacedYearCount > 0
      ? tn('time.periods.counts.birthDeathYears', stored.unplacedYearCount, {
          n: stored.unplacedYearCount,
        })
      : null,
  ].filter((part): part is string => part !== null)

  const unplacedTotal = stored.unplacedMomentCount + stored.unplacedYearCount
  const storedNamesEras = stored.eras.length > 0

  return (
    <>
      <PageHeader
        title={t('time.periods.title')}
        lede={<p>{t('time.periods.lede')}</p>}
        actions={
          <Button icon={Plus} onClick={add} data-testid="add-era">
            {t('time.periods.add')}
          </Button>
        }
      />
      <section className="chronology" aria-labelledby={headingId} data-testid="chronology-settings">
        <h2 className="settings__heading" id={headingId}>
          {t('time.periods.heading')}
        </h2>

        {drafts.length === 0 ? (
          <EmptyState
            testId="chronology-empty"
            title={
              storedNamesEras ? t('time.periods.empty.saveToGoBack') : t('time.periods.empty.plain')
            }
            hint={t('time.periods.empty.hint')}
            action={
              <Button icon={Plus} onClick={add} data-testid="add-era-empty">
                {t('time.periods.add')}
              </Button>
            }
          />
        ) : (
          <p className="settings__note" data-testid="chronology-note">
            {t('time.periods.note')}
          </p>
        )}

        {drafts.length > 0 && unplacedTotal > 0 ? (
          <ChronologyUnplaced
            universeId={universeId}
            stored={stored}
            storedNamesEras={storedNamesEras}
            unplacedTotal={unplacedTotal}
            unplacedParts={unplacedParts}
          />
        ) : null}

        {drafts.length > 1 ? (
          <Field
            group
            className="eras__order"
            id={`${headingId}-order`}
            label={t('time.periods.earliestFirst')}
          >
            {(control) => (
              <ol
                className="eras__line"
                aria-labelledby={control['aria-labelledby']}
                data-testid="era-order"
              >
                {drafts.map((era) => (
                  <li key={era.key}>
                    <bdi>{era.name.trim() || t('time.periods.newCap')}</bdi>
                  </li>
                ))}
              </ol>
            )}
          </Field>
        ) : null}

        {drafts.length > 0 ? (
          <ol className="eras" data-testid="eras">
            {drafts.map((era, index) => (
              <ChronologyEraRow
                key={era.key}
                era={era}
                index={index}
                drafts={drafts}
                fieldErrors={fieldErrors}
                update={update}
                move={move}
                change={change}
              />
            ))}
          </ol>
        ) : null}

        <p className="visually-hidden" role="status" data-testid="era-moved">
          {moved}
        </p>

        {fieldErrors.eras ? <p className="field__error">{fieldErrors.eras}</p> : null}

        {blocked ? (
          <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
        ) : null}

        {message ? (
          <p className="form__message" role="alert" data-testid="chronology-error">
            {message}
          </p>
        ) : null}

        {/* Nothing to save and no periods to save: no lone disabled button under the empty state. */}
        {dirty || drafts.length > 0 ? (
          <div className="form__actions eras__actions">
            <SaveAction
              label={t('time.periods.save')}
              isDirty={dirty}
              isSaving={saving}
              saves={saves}
              restingStatus={t('time.periods.saved')}
              statusId={statusId}
              statusTestId="chronology-status"
              testId="save-chronology"
              type="button"
              onSave={() => void save()}
            />
            {dirty ? (
              <Button tone="secondary" onClick={discard}>
                {t('time.periods.discard')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  )
}

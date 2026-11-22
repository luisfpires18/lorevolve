import { useI18n } from '../../i18n'
import { ChronologyPointFields } from '../ChronologyPointFields'
import { formatChronologyPoint } from '../../chronology/format'
import type { Chronology } from '../../chronology/types'
import { EMPTY_POINT } from '../../stories/sceneDraft'
import type { chronologyOf } from '../../stories/sceneDraft'
import type { useRelationsState } from '../../relationships/useRelationsState'
import { FormActions } from '../FormActions'
import { QuietNote } from '../QuietNote'

export function RelationsWhen({
  chronology,
  reckonsInEras,
  when,
  setWhen,
  shownAt,
  setShownAt,
  whenOpen,
  whenStatus,
  whenReady,
  at,
}: {
  chronology: Chronology
  reckonsInEras: boolean
  when: ReturnType<typeof useRelationsState>['when']
  setWhen: ReturnType<typeof useRelationsState>['setWhen']
  shownAt: ReturnType<typeof useRelationsState>['shownAt']
  setShownAt: ReturnType<typeof useRelationsState>['setShownAt']
  whenOpen: ReturnType<typeof useRelationsState>['whenOpen']
  whenStatus: ReturnType<typeof useRelationsState>['whenStatus']
  whenReady: boolean
  at: ReturnType<typeof chronologyOf> | null
}) {
  const { t } = useI18n()

  return (
    <>
      {/* Which relations hold at one time (Issue #18): the universe's own date, as precise as wanted. */}
      <div className="relwhen" data-testid="relations-when">
        {when === null ? (
          <button
            ref={whenOpen}
            type="button"
            className="linkbutton"
            onClick={() => setWhen(shownAt ?? EMPTY_POINT)}
            data-testid="relations-when-open"
          >
            {shownAt
              ? t('relationships.section.changeTime')
              : t('relationships.section.showAtTime')}
          </button>
        ) : (
          <form
            className="relwhen__form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!whenReady) return
              setShownAt(when)
              setWhen(null)
              requestAnimationFrame(() => whenStatus.current?.focus())
            }}
          >
            <ChronologyPointFields
              chronology={chronology}
              ids={{
                eraId: 'relations-at-eraId',
                year: 'relations-at-year',
                month: 'relations-at-month',
                day: 'relations-at-day',
              }}
              value={when}
              onChange={(part, next) => setWhen({ ...when, [part]: next })}
              errors={{}}
            />
            {!whenReady ? (
              <QuietNote spacing="hint" testId="relations-when-hint">
                {reckonsInEras
                  ? t('relationships.section.whenHintEras')
                  : t('relationships.section.whenHint')}
              </QuietNote>
            ) : null}
            <div className="actions actions--tight">
              <FormActions
                submitLabel={t('relationships.section.show')}
                disabled={!whenReady}
                submitTestId="relations-when-show"
                onCancel={() => {
                  setWhen(null)
                  requestAnimationFrame(() => whenOpen.current?.focus())
                }}
                size="sm"
              />
            </div>
          </form>
        )}
        {shownAt && at ? (
          <p
            className="relwhen__status"
            role="status"
            tabIndex={-1}
            ref={whenStatus}
            data-testid="relations-when-status"
          >
            {t('relationships.section.showingAt', {
              date: formatChronologyPoint(chronology, {
                year: at.year ?? 0,
                month: at.month,
                day: at.day,
                eraId: at.eraId,
                monthId: at.monthId,
              }),
            })}{' '}
            <button
              type="button"
              className="linkbutton"
              onClick={() => {
                setShownAt(null)
                requestAnimationFrame(() => whenOpen.current?.focus())
              }}
              data-testid="relations-when-clear"
            >
              {t('relationships.section.showAll')}
            </button>
          </p>
        ) : null}
      </div>
    </>
  )
}

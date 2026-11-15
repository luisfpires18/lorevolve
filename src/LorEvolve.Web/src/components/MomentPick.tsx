import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import { listTimelineItems } from '../timeline/api'
import { TimelineSource } from '../timeline/types'
import type { MomentRef } from '../progression/types'

/**
 * One timeline moment, found by searching the universe's moments by title. The chosen one is a token with Remove; one in the
 * Trash stays chosen and says so, and is never offered.
 */
export function MomentPick({
  universeId,
  label,
  value,
  onChange,
  error,
  testId,
}: {
  universeId: string
  label: string
  value: MomentRef | null
  onChange: (moment: MomentRef | null) => void
  error?: string
  testId: string
}) {
  const { t } = useI18n()
  const id = useId()
  const errorId = useId()
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<MomentRef[] | null>(null)

  useEffect(() => {
    if (value) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      listTimelineItems(
        universeId,
        {
          source: TimelineSource.Event,
          storyId: null,
          canonStatus: null,
          entityId: null,
          search,
          page: 1,
        },
        controller.signal,
      )
        .then((page) =>
          setFound(
            page.items.map((item) => ({ id: item.sourceId, title: item.title, isTrashed: false })),
          ),
        )
        .catch(() => {
          if (!controller.signal.aborted) setFound([])
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, search, value])

  return (
    <div className="field" data-testid={testId}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {value ? (
        <p className="token" data-testid={`${testId}-chosen`}>
          <bdi>{value.title}</bdi>
          {value.isTrashed ? (
            <span className="token__note"> {t('time.momentPick.inTrash')}</span>
          ) : null}
          <button
            type="button"
            className="token__remove"
            aria-label={t('time.momentPick.remove', { title: value.title })}
            onClick={() => onChange(null)}
          >
            &times;
          </button>
        </p>
      ) : (
        <>
          <input
            id={id}
            className="field__input"
            type="search"
            placeholder={t('time.momentPick.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            data-testid={`${testId}-search`}
          />
          {found && found.length > 0 ? (
            <ul className="momentpick__list" aria-label={t('time.momentPick.found', { label })}>
              {found.map((moment) => (
                <li key={moment.id}>
                  <button
                    type="button"
                    className="linkbutton"
                    onClick={() => onChange(moment)}
                    data-testid={`${testId}-option`}
                  >
                    {moment.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : found ? (
            <p className="field__hint">{t('time.momentPick.none')}</p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

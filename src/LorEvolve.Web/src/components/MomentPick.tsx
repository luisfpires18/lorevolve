import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { SearchField } from './SearchField'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { listTimelineItems } from '../timeline/api'
import { TimelineSource } from '../timeline/types'
import type { MomentRef } from '../progression/types'
import { QuietNote } from './QuietNote'
import { Token } from './Token'

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
  const [search, setSearch] = useState('')
  const settled = useDebouncedValue(search)
  const [found, setFound] = useState<MomentRef[] | null>(null)

  useEffect(() => {
    if (value) return
    const controller = new AbortController()
    listTimelineItems(
      universeId,
      {
        source: TimelineSource.Event,
        storyId: null,
        canonStatus: null,
        entityId: null,
        search: settled,
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
    return () => {
      controller.abort()
    }
  }, [universeId, settled, value])

  return (
    <Field label={label} id={id} error={error} data-testid={testId}>
      {(control) =>
        value ? (
          <Token
            as="p"
            testId={`${testId}-chosen`}
            note={value.isTrashed ? t('time.momentPick.inTrash') : undefined}
            removeLabel={t('time.momentPick.remove', { title: value.title })}
            onRemove={() => onChange(null)}
          >
            <bdi>{value.title}</bdi>
          </Token>
        ) : (
          <>
            <SearchField
              {...control}
              placeholder={t('time.momentPick.search')}
              value={search}
              onChange={setSearch}
              testId={`${testId}-search`}
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
              <QuietNote spacing="hint">{t('time.momentPick.none')}</QuietNote>
            ) : null}
          </>
        )
      }
    </Field>
  )
}

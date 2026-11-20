import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { Quoted } from '../NameList'
import { ReadGate } from '../ReadGate'
import { t, tx, useI18n } from '../../i18n'
import type { TextKey } from '../../i18n/core'
import type { Dictionary } from '../../i18n/en'
import type { Load } from '../../lib/useAsyncRead'

/**
 * What an idea's or a board's editor shows instead of the record: loading, missing, in another universe, or failed to
 * open. `words` is the record's keys (`ideas.editor`, `ideas.board`); `elsewhere` holds the link words of the other
 * universe's hint (`open`, and `back` where the hint has one). Catalogue: `docs/design/ui-components.md`.
 */
export function RecordUnavailable({
  load,
  testIdPrefix: id,
  words: w,
  listPath,
  contextUniverse,
  elsewhere,
  reread,
}: {
  load: Load<null> | { kind: 'elsewhere' }
  testIdPrefix: string
  words: 'ideas.editor' | 'ideas.board'
  listPath: string
  contextUniverse: { id: string; name: string } | null
  elsewhere: { open: ReactNode; back?: ReactNode }
  reread: () => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const key = (name: string) => `${w}.${name}` as TextKey<Dictionary>

  if (load.kind === 'elsewhere') {
    return (
      <EmptyState
        testId={`${id}-not-in-universe`}
        title={tx(key('elsewhere.title'), {
          universe: <Quoted text={contextUniverse?.name ?? ''} />,
        })}
        hint={tx(key('elsewhere.hint'), {
          open: <Link to={listPath}>{elsewhere.open}</Link>,
          ...(elsewhere.back !== undefined
            ? { back: <Link to={listPath}>{elsewhere.back}</Link> }
            : {}),
        })}
      />
    )
  }

  return (
    <ReadGate
      load={load}
      loading={{ text: t(key('loading')), testId: `${id}-loading` }}
      error={{ onRetry: reread, retryLabel: t(key('retry')), testId: `${id}-load-error` }}
      missing={
        <EmptyState
          testId={`${id}-missing`}
          title={t(key('missing.title'))}
          hint={tx(key('missing.hint'), {
            link: <Link to={`${listPath}?view=deleted`}>{t(key('missing.link'))}</Link>,
          })}
        />
      }
    >
      {() => null}
    </ReadGate>
  )
}

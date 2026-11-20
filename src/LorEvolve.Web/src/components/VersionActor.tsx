import { useI18n } from '../i18n'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { DateText } from './DateText'

/**
 * Who did something, by name. Alone it is one item of a history row's meta line ("by {name}"), or a plain note for a
 * version that recorded no one - saved before LorEvolve kept authors, or restored from a backup, which carries none.
 * With `at` it is a byline: the name set apart, then the date and time (a comment, a suggestion). With `lead` it is the
 * sentence around the name ("Resolved by {name}"), then the date after a dot when there is one. `unknown` is what
 * stands for a name nobody recorded. Catalogue: docs/design/ui-components.md.
 */
export function VersionActor({
  name,
  unknown,
  at,
  lead,
  testId,
}: {
  name: string | null
  unknown?: string
  at?: string | null
  lead?: TextKey<Dictionary>
  testId?: string
}) {
  const { t, tx } = useI18n()
  const who = name === null ? (unknown ?? t('review.actor.notRecorded')) : <bdi>{name}</bdi>
  const when = at ? <DateText value={at} withTime /> : null

  if (lead) {
    return (
      <>
        {tx(lead, { name: who })}
        {when ? (
          <>
            {' · '}
            {when}
          </>
        ) : null}
      </>
    )
  }
  if (at !== undefined) {
    return (
      <>
        <span className="reviewcomment__author" data-testid={testId}>
          {who}
        </span>
        {when}
      </>
    )
  }
  return (
    <span data-testid="version-actor">
      {name === null ? t('review.actor.notRecorded') : tx('review.actor.by', { name: who })}
    </span>
  )
}

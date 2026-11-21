import { Announce } from '../components/Announce'
import { FormMessage } from '../components/FormMessage'

/**
 * What a shelf says after a card moves, for the Stories and category shelves: the polite announcement for screen
 * readers, and the move's error when it failed. Each shelf names both test ids.
 */
export function shelfNotices(
  { announcement, moveError }: { announcement: string; moveError: string | null },
  testIds: { announcement: string; moveError: string },
) {
  return (
    <>
      <Announce testId={testIds.announcement}>{announcement}</Announce>
      {moveError ? <FormMessage testId={testIds.moveError}>{moveError}</FormMessage> : null}
    </>
  )
}

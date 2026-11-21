/**
 * The blank paper plate held while the session probe or a screen's code is in flight, so nothing paints before it
 * settles. Silent on screen; `label` is what a screen reader hears. `lib/launch.ts` waits for `.session-pending` to go.
 */
export function SessionPending({ label }: { label: string }) {
  return <div className="session-pending" role="status" aria-label={label} />
}

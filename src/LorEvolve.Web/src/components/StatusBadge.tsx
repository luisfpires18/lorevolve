/**
 * A status, stated quietly: a drawn glyph and the word. Hollow for the first step, half for the
 * middle, filled for the last - Idea, Draft, Canon for lore; Planning, Drafting, Complete for a
 * story. The word always says it, so nothing depends on the glyph or on colour, and the glyph is
 * drawn by CSS rather than typed, so a screen reader and a test read only the word.
 *
 * Informative, never the loudest mark on a card: Canon is the settled, ordinary state, so it is
 * not a solid block. Presentation only - what a status means and how it changes is elsewhere.
 */
export function StatusBadge({
  step,
  label,
  className,
  testId,
}: {
  /** 0, 1 or 2: how far along. Both status enums use exactly these values. */
  step: 0 | 1 | 2
  label: string
  /** Extra classes a screen already selects this by. */
  className?: string
  testId?: string
}) {
  return (
    <span
      className={['statusbadge', className].filter(Boolean).join(' ')}
      data-step={step}
      data-testid={testId}
    >
      {label}
    </span>
  )
}

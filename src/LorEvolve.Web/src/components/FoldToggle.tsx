import { ChevronRight } from 'lucide-react'

/** The fold's switch: a chevron button before the heading, named with what it folds. */
export function FoldToggle({
  open,
  onToggle,
  controls,
  label,
  testId,
}: {
  open: boolean
  onToggle: (open: boolean) => void
  controls: string
  label: string
  testId: string
}) {
  return (
    <button
      className="foldtoggle"
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      title={open ? 'Collapse' : 'Expand'}
      onClick={() => onToggle(!open)}
      data-testid={testId}
    >
      <ChevronRight
        className="foldtoggle__chevron"
        aria-hidden="true"
        focusable="false"
        strokeWidth={1.75}
      />
    </button>
  )
}

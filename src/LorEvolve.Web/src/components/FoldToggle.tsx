import { ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()

  return (
    <button
      className="foldtoggle"
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={
        open
          ? t('stories.page.fold.collapseLabel', { label })
          : t('stories.page.fold.expandLabel', { label })
      }
      title={open ? t('stories.page.fold.collapse') : t('stories.page.fold.expand')}
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

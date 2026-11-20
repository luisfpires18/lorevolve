import type { ReactNode } from 'react'
import { SectionTitle } from './Section'

/**
 * The head of a panel on an entry or a settings screen: its title and, opposite it, the panel's own action (Add era,
 * Add relationship). `look="display"` is the panel's name in the display face; `section` and `label` are SectionTitle's
 * tones. `align="start"` tops the title and the action instead of centring them. `className` places the head on its
 * screen; `titleClassName` adds to the title. Catalogue: docs/design/ui-components.md.
 */
export function PanelHead({
  title,
  titleId,
  level = 2,
  look,
  align = 'center',
  action,
  className,
  titleClassName,
}: {
  title: ReactNode
  titleId?: string
  level?: 2 | 3
  look: 'display' | 'section' | 'label'
  align?: 'center' | 'start'
  action?: ReactNode
  className?: string
  titleClassName?: string
}) {
  const Title = `h${level}` as 'h2'
  const classes = ['panelhead', align === 'start' && 'panelhead--start', className]
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {look === 'display' ? (
        <Title
          className={['panelhead__title', titleClassName].filter(Boolean).join(' ')}
          id={titleId}
        >
          {title}
        </Title>
      ) : (
        <SectionTitle level={level} tone={look} id={titleId} className={titleClassName}>
          {title}
        </SectionTitle>
      )}
      {action}
    </div>
  )
}

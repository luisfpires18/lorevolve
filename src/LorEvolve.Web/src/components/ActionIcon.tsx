import type { LucideIcon } from 'lucide-react'

/**
 * The icon inside a `.button`, beside the label that names the action.
 *
 * Always decorative: the label is what is read out and what a test or a screen reader finds, so the
 * icon is hidden from assistive technology and never focusable. One size, one stroke, and the
 * button's own colour, so every action icon in LorEvolve looks like the others.
 */
export function ActionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="button__icon" aria-hidden="true" focusable="false" strokeWidth={1.75} />
}

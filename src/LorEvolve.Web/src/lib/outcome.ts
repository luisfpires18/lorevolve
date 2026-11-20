import type { ReactNode } from 'react'

/** What a restore or delete in a list just did, said once above it, and the way to what it touched. */
export interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

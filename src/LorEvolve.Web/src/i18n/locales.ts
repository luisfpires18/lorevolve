import type { ComponentType, SVGProps } from 'react'
import en, { type Dictionary } from './en'
import { FlagGB, FlagPT } from './flags'

export type Locale = {
  /** BCP 47 tag: `<html lang>`, the `Intl` locale and the saved choice. */
  code: string
  /** The language's name in itself, so a reader finds their own whatever the current language is. */
  label: string
  flag: ComponentType<SVGProps<SVGSVGElement>>
  /**
   * Offered in the switch and picked from the browser's languages. A language that is not ready can still be
   * previewed by saving its code under `localStorage['lorevolve-locale']`.
   */
  ready: boolean
  load: () => Promise<Dictionary>
}

/**
 * Every language LorEvolve knows (ADR 0071). Adding one: its dictionary file, one entry here, its flag in `flags.tsx`,
 * and the same code and `ready` in the language bootstrap's list in `index.html`.
 */
export const LOCALES: readonly Locale[] = [
  { code: 'en', label: 'English', flag: FlagGB, ready: true, load: async () => en },
  {
    code: 'pt-PT',
    label: 'Português',
    flag: FlagPT,
    ready: true,
    load: () => import('./pt-PT').then((module) => module.default),
  },
]

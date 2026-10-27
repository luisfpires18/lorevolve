import { useSyncExternalStore } from 'react'

/**
 * LorEvolve's one appearance setting (013): Light or Dark, for the portal and the workspace at once.
 *
 * The source of truth is `data-theme` on `<html>`. `index.html` sets it before the first paint - the saved choice, or
 * the system's when nothing is saved - so no page is drawn in one theme and then flipped. This module is the only thing
 * that changes it afterwards. An explicit choice is kept in this browser (`localStorage`); it is not an account
 * setting, so it holds signed in and out alike and signing in or out never changes it.
 *
 * Without a saved choice LorEvolve keeps following the system as it changes; once the reader chooses, the system is no
 * longer consulted. Another tab choosing updates this one too.
 */
export type Theme = 'light' | 'dark'

/** Also read by the bootstrap in `index.html`; keep the two in step. */
export const THEME_STORAGE_KEY = 'lorevolve-theme'

/** The browser chrome's colour in each theme - the same values the bootstrap writes. */
export const THEME_COLOR: Record<Theme, string> = { light: '#f6f2ea', dark: '#151617' }

const listeners = new Set<() => void>()
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

function saved(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  for (const listener of listeners) listener()
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** The reader's explicit choice: applied everywhere at once and remembered in this browser. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private windows and blocked storage: the choice still applies for this page.
  }
  apply(theme)
}

let watching = false

/** Called once at startup (`main.tsx`), so every page follows the system until the reader chooses. */
export function watchTheme() {
  if (watching) return
  watching = true
  // The system's scheme counts only while the reader has not chosen.
  systemDark().addEventListener('change', (event) => {
    if (!saved()) apply(event.matches ? 'dark' : 'light')
  })
  // Another tab of LorEvolve chose: follow it.
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return
    apply(saved() ?? (systemDark().matches ? 'dark' : 'light'))
  })
}

function subscribe(listener: () => void) {
  watchTheme()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, currentTheme), setTheme]
}

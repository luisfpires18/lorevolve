import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import en, { type Dictionary } from './en'
import { LOCALES } from './locales'
import {
  pickLocale,
  splitPlaceholders,
  translate,
  translatePlural,
  type PluralKey,
  type TextKey,
  type Vars,
} from './core'

/**
 * LorEvolve's language (ADR 0071), shaped like the theme (`lib/theme.ts`): a choice kept in this browser, not on the
 * account, so it holds signed in and out alike. Without one, the first browser language a ready translation covers,
 * else English. `startI18n` runs before the first render, so a reader never sees English and then their language.
 * The key is also read by the language bootstrap in `index.html`; keep the two in step.
 */
export const LOCALE_STORAGE_KEY = 'lorevolve-locale'

let locale = 'en'
let messages: Dictionary = en
let latest = 0
const listeners = new Set<() => void>()

function saved() {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

function initial() {
  return pickLocale(saved(), navigator.languages ?? [], LOCALES)
}

async function apply(code: string) {
  const target = LOCALES.find((entry) => entry.code === code) ?? LOCALES[0]
  const ticket = ++latest
  let dictionary: Dictionary
  try {
    dictionary = await target.load()
  } catch {
    // The translation's chunk did not load (offline, or a redeploy): stay in the current language.
    return
  }
  if (ticket !== latest) return // A later choice was made while this one loaded.
  locale = target.code
  messages = dictionary
  document.documentElement.lang = locale
  for (const listener of listeners) listener()
}

export function currentLocale() {
  return locale
}

/** The reader's explicit choice: remembered in this browser and applied once its dictionary has loaded. */
export function setLocale(code: string) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code)
  } catch {
    // Private windows and blocked storage: the choice still applies for this page.
  }
  return apply(code)
}

let started = false

/** Called once in `main.tsx`, awaited before the first render. Another tab's choice is followed too. */
export function startI18n() {
  if (!started) {
    started = true
    window.addEventListener('storage', (event) => {
      if (event.key === LOCALE_STORAGE_KEY) void apply(initial())
    })
  }
  return apply(initial())
}

/** A plain message, `{name}` placeholders filled. */
export function t(key: TextKey<Dictionary>, vars?: Vars) {
  return translate(messages, en, key, vars)
}

/** A plural message for `count`, in the form the current language uses; `{count}` is filled for you. */
export function tn(key: PluralKey<Dictionary>, count: number, vars?: Vars) {
  return translatePlural(locale, messages, en, key, count, vars)
}

/**
 * The message for an API refusal's `code`, or null when LorEvolve has no words for that one and the caller should
 * keep the server's own sentence (#108). Looked up by a value the server chose, so it is checked at run time rather
 * than by the key type.
 */
export function apiErrorMessage(code: string) {
  const group = (en as Record<string, unknown>).apiErrors as Record<string, string>
  return code in group ? translate(messages, en, `apiErrors.${code}`) : null
}

/** A message with nodes in its placeholders, for sentences that hold a link or a bold name. */
export function tx(key: TextKey<Dictionary>, nodes: Record<string, ReactNode>): ReactNode {
  return splitPlaceholders(translate(messages, en, key)).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return createElement(Fragment, { key: index }, name && name in nodes ? nodes[name] : part)
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For components: re-renders when the language changes. */
export function useI18n() {
  return { locale: useSyncExternalStore(subscribe, currentLocale), t, tn, tx }
}

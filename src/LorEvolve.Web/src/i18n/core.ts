/*
 * The pure half of LorEvolve's i18n (ADR 0071): looking a key up in a dictionary, filling its placeholders, choosing a
 * plural form, and choosing the starting language. No React, no DOM, no storage, so `node --test` can run it as is.
 */

/** A plural message: the forms `Intl.PluralRules` names. `other` is the one every language has. */
export type Plural = {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

/** A dictionary's shape: nested groups of messages, each a string or a plural. */
export type Messages = { [key: string]: string | Plural | Messages }

/** Every dictionary has the English one's keys, with any wording in each. */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends { other: string }
      ? Plural
      : Shape<T[K]>
}

/** The dotted keys whose value is a plain message, e.g. `language.label`. */
export type TextKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends { other: string }
      ? never
      : `${K}.${TextKey<T[K]>}`
}[keyof T & string]

/** The dotted keys whose value is a plural. */
export type PluralKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends { other: string }
      ? K
      : `${K}.${PluralKey<T[K]>}`
}[keyof T & string]

export type Vars = Record<string, string | number>

function find(messages: Messages, key: string): string | Plural | Messages | undefined {
  let node: string | Plural | Messages | undefined = messages
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined
    node = (node as Messages)[part]
  }
  return node
}

/** Fills `{name}` placeholders. A placeholder with no value is left as written, so a gap is visible, not blank. */
export function fill(message: string, vars?: Vars) {
  if (!vars) return message
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

/** A plain message from `messages`, else from `fallback` (English), else the key itself. */
export function translate(messages: Messages, fallback: Messages, key: string, vars?: Vars) {
  const hit = find(messages, key)
  const message = typeof hit === 'string' ? hit : find(fallback, key)
  return fill(typeof message === 'string' ? message : key, vars)
}

/**
 * The plural form `Intl.PluralRules` picks for `count` in `locale`, falling back to `other` when the dictionary does
 * not spell that form out. `{count}` is the count as the language writes numbers.
 */
export function translatePlural(
  locale: string,
  messages: Messages,
  fallback: Messages,
  key: string,
  count: number,
  vars?: Vars,
) {
  const hit = find(messages, key)
  const forms = (hit && typeof hit === 'object' && 'other' in hit ? hit : find(fallback, key)) as
    Plural | undefined
  if (!forms || typeof forms.other !== 'string') return key
  const form = forms[new Intl.PluralRules(locale).select(count)] ?? forms.other
  return fill(form, { count: new Intl.NumberFormat(locale).format(count), ...vars })
}

/** Splits a message on its placeholders, so the caller can put a node (a link, a bold name) in each gap. */
export function splitPlaceholders(message: string) {
  return message.split(/(\{\w+\})/).filter(Boolean)
}

/**
 * The language LorEvolve starts in: the reader's saved choice if LorEvolve knows that language at all (ready or not,
 * so a translation in progress can be previewed), else the first browser language a ready translation covers, else
 * English. A browser language matches on its base, so `pt-BR` and `pt` both open the `pt-PT` translation.
 */
export function pickLocale(
  saved: string | null,
  browser: readonly string[],
  known: readonly { code: string; ready: boolean }[],
) {
  if (saved && known.some((locale) => locale.code === saved)) return saved
  const base = (tag: string) => tag.toLowerCase().split('-')[0]
  for (const tag of browser) {
    const match =
      known.find((locale) => locale.ready && locale.code.toLowerCase() === tag.toLowerCase()) ??
      known.find((locale) => locale.ready && base(locale.code) === base(tag))
    if (match) return match.code
  }
  return 'en'
}

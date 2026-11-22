// Run with `node --test uiContract/sharedRows.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the small shared rows on their parts (#456): a fact is Fact in a FactList, a foot bar is ActionBar, a panel's
// head is PanelHead, a group rule is SectionTitle's `rule` tone, a removable chip is Token in a TokenList, a blocked
// note is BlockedCallout, a byline is VersionActor and a publish list of names is NameListBlock. Every string literal counts, class strings built in template literals
// included, so a class handed through a helper or a prop is caught too. Each list only shrinks: a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { literals, read, webRoot } from './support.ts'

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

// Every word of every string literal; the mark `literals()` puts for `${...}` is split off, so "facts__row ${x}" and
// `sectionrule--${tone}` still count.
const words = (source: string) =>
  literals(stripComments(source)).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001 ').split(/\s+/).filter(Boolean),
  )

// `tsxOnly`: the plain word ("facts" in a sentence, a reset `token`) is text in the .ts dictionaries, never a class.
type Rule = {
  why: string
  writes: (word: string) => boolean
  allowed: string[]
  tsxOnly?: boolean
}

const RULES: Rule[] = [
  {
    why: 'a fact row is Fact (components/Fact)',
    writes: (word) => ['facts__row', 'facts__key', 'facts__value'].includes(word),
    allowed: ['src/components/Fact.tsx'],
  },
  {
    why: 'a list of facts is FactList with a look, never a screen of its own (`*__facts`)',
    writes: (word) => word.endsWith('__facts') || /__fact$/.test(word),
    allowed: [],
  },
  {
    why: 'FactList draws the list of facts (`facts`, `facts--*`)',
    writes: (word) => word === 'facts' || word.startsWith('facts--'),
    allowed: ['src/components/FactList.tsx'],
    tsxOnly: true,
  },
  {
    why: 'PanelHead draws the panel head (`panelhead`, `panelhead--*`, `panelhead__*`)',
    writes: (word) => word === 'panelhead' || /^panelhead(--|__)/.test(word),
    allowed: ['src/components/PanelHead.tsx'],
    tsxOnly: true,
  },
  {
    why: 'a bar across the foot is ActionBar (components/ActionBar)',
    writes: (word) => word === 'actionbar' || word.startsWith('actionbar__'),
    allowed: ['src/components/ActionBar.tsx'],
  },
  {
    why: 'a panel head is PanelHead (components/PanelHead)',
    writes: (word) =>
      [
        'relations__head',
        'relations__title',
        'progression__head',
        'progression__title',
        'history__title',
      ].includes(word),
    allowed: [],
  },
  {
    why: 'a group rule is SectionTitle tone="rule" or "rule-accent" (components/Section)',
    writes: (word) => word.startsWith('sectionrule'),
    allowed: ['src/components/PageHeader.tsx', 'src/components/Section.tsx'],
  },
  {
    why: 'a removable chip is Token (components/Token)',
    writes: (word) => word === 'token__remove' || word === 'token__note',
    allowed: ['src/components/Token.tsx'],
  },
  {
    why: 'a list of removable chips is TokenList (components/Token)',
    writes: (word) => word === 'storylinks__list',
    allowed: ['src/components/Token.tsx'],
    tsxOnly: true,
  },
  {
    why: 'a blocked note is BlockedCallout (lore/FieldBlockedNote)',
    writes: (word) => word === 'types__blockedtext',
    allowed: ['src/components/lore/FieldBlockedNote.tsx'],
    tsxOnly: true,
  },
  {
    why: 'a byline is VersionActor with `at` or `lead` (components/VersionActor)',
    writes: (word) => word === 'reviewcomment__author',
    allowed: ['src/components/VersionActor.tsx'],
  },
  {
    why: 'a publish list of names is NameListBlock (components/publishing/NameListBlock)',
    writes: (word) => word === 'publication__selectedlist',
    allowed: ['src/components/publishing/NameListBlock.tsx'],
  },
]

const offends = (source: string, rule: Rule) => words(source).some(rule.writes)
const rule = (why: string) => RULES.find((one) => one.why.startsWith(why))!

test('the shared rows guard catches a hand copy, template-built classes included', () => {
  const fact = rule('a fact row')
  assert.ok(offends('<div className="facts__row">', fact))
  assert.ok(offends('<dd className={`facts__value ${extra}`}>', fact))
  assert.ok(offends("const key = ok ? 'facts__key' : 'other'", fact))
  assert.ok(!offends('<Fact name={name}>{value}</Fact>', fact))
  const list = rule('a list of facts')
  assert.ok(offends('<dl className="restore__facts">', list))
  assert.ok(offends('<div className={`profile__fact ${x}`}>', list))
  assert.ok(!offends('<div className="facts__sections">', list))
  const factList = rule('FactList draws')
  assert.ok(offends('<dl className="facts">', factList))
  assert.ok(offends('<dl className={`facts facts--${look}`}>', factList))
  assert.ok(offends("<dl className={ok ? 'facts--ruled' : ''}>", factList))
  assert.ok(!offends('<FactList look="ruled">', factList))
  assert.ok(!offends('<div className="facts__sections">', factList))
  const panel = rule('PanelHead draws')
  assert.ok(offends('<div className="panelhead">', panel))
  assert.ok(offends('<h2 className={`panelhead__title ${x}`}>', panel))
  assert.ok(offends("<div className={start ? 'panelhead--start' : ''}>", panel))
  assert.ok(!offends('<PanelHead look="display" className="history__head" />', panel))
  const bar = rule('a bar across')
  assert.ok(offends('<footer className={`actionbar ${where}`}>', bar))
  assert.ok(offends('<div className="actions actionbar__actions">', bar))
  assert.ok(!offends('<div className="article__bar">', bar))
  const head = rule('a panel head')
  assert.ok(offends('<div className="relations__head">', head))
  assert.ok(offends('<h2 className={`progression__title ${x}`}>', head))
  const sectionRule = rule('a group rule')
  assert.ok(offends('<h3 className="sectionrule sectionrule--accent">', sectionRule))
  assert.ok(offends('titleClassName={`sectionrule--${tone}`}', sectionRule))
  assert.ok(!offends('<SectionTitle tone="rule-accent">', sectionRule))
  const token = rule('a removable chip')
  assert.ok(offends('<button className="token__remove">', token))
  assert.ok(offends('<span className={`token__note ${x}`}>', token))
  assert.ok(!offends('<Token removeLabel={label} onRemove={remove}>', token))
  const tokenList = rule('a list of removable chips')
  assert.ok(offends('<ul className="storylinks__list">', tokenList))
  assert.ok(!offends('<TokenList>{tokens}</TokenList>', tokenList))
  const blockedNote = rule('a blocked note')
  assert.ok(offends('<p className="types__blockedtext">{text}</p>', blockedNote))
  assert.ok(
    !offends('<BlockedCallout className="types__blocked" testId={id} text={text}>', blockedNote),
  )
  const byline = rule('a byline')
  assert.ok(offends('<span className="reviewcomment__author">', byline))
  assert.ok(!offends('<p className="reviewcomment__meta">', byline))
  const names = rule('a publish list')
  assert.ok(offends('<ul className={`publication__selectedlist ${x}`}>', names))
  assert.ok(!offends('<span className="publication__selectedtype">', names))
  // A comment that names a class is not a copy of it.
  assert.ok(!offends('// was <div className="facts__row">\nconst a = 1', fact))
})

test('each small shared row is drawn by its part and the listed files only', () => {
  for (const one of RULES) {
    const found = codeFiles
      .filter((file) => !one.tsxOnly || file.endsWith('.tsx'))
      .filter((file) => offends(read(file), one))
    assert.deepEqual(
      found.filter((file) => !one.allowed.includes(file)),
      [],
      `${one.why} (docs/design/ui-components.md)`,
    )
    assert.deepEqual(
      one.allowed.filter((file) => !found.includes(file)),
      [],
      `${one.why}: stale allowlist entry, remove it`,
    )
  }
})

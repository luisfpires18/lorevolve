import { Extension, Node } from '@tiptap/react'
import { history, redo, undo } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import type { Fragment } from '@tiptap/pm/model'
import { mentionName, type ManuscriptNode } from '../lore/mentions'

/**
 * The manuscript's whole schema (ADR 0058 amendment): a paragraph per line of the stored text, plain text, and a mention.
 * No marks and no other blocks, so nothing can be written here that the stored plain text cannot hold. Paragraphs keep
 * their whitespace as typed, pasted or copied.
 */
export const extensions = [
  Node.create({ name: 'doc', topNode: true, content: 'paragraph+' }),
  Node.create({
    name: 'paragraph',
    group: 'block',
    content: 'inline*',
    whitespace: 'pre',
    parseHTML: () => [{ tag: 'p' }],
    renderHTML: () => ['p', 0],
  }),
  Node.create({ name: 'text', group: 'inline' }),
  // A mention is one piece of the prose, a chip with its entry's name: the caret steps over it and Backspace takes it whole.
  Node.create({
    name: 'mention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addAttributes: () => ({
      id: { default: null, rendered: false },
      name: { default: '', rendered: false },
    }),
    parseHTML: () => [
      {
        tag: 'span[data-mention]',
        getAttrs: (element) => ({
          id: element.getAttribute('data-mention'),
          name: mentionName(element.textContent ?? ''),
        }),
      },
    ],
    renderHTML: ({ node }) => [
      'span',
      {
        class: 'mention mention--chip',
        'data-mention': node.attrs.id,
        'data-testid': 'manuscript-chip',
      },
      node.attrs.name,
    ],
    renderText: ({ node }) => node.attrs.name as string,
  }),
  Extension.create({
    name: 'manuscriptKeys',
    addProseMirrorPlugins: () => [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
    ],
    // Shift+Enter is a line break like Enter: the stored text has only one kind.
    addKeyboardShortcuts() {
      return { 'Shift-Enter': () => this.editor.commands.splitBlock() }
    },
  }),
]

export const asDoc = (fragment: Fragment): ManuscriptNode => {
  const content = fragment.toJSON() as ManuscriptNode[] | null
  return {
    type: 'doc',
    content: (content ?? []).every((node) => node.type === 'paragraph')
      ? (content ?? [])
      : [{ type: 'paragraph', content: content ?? [] }],
  }
}

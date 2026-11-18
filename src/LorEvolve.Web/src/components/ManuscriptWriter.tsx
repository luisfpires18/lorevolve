import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Slice } from '@tiptap/pm/model'
import { useEffect, useId, useRef, useState } from 'react'
import { useMentionSearch } from '../lore/mentionSearch'
import { manuscriptDoc, manuscriptText, plainMentions, type ManuscriptNode } from '../lore/mentions'
import { MentionSuggestions } from './MentionSuggestions'
import { extensions, asDoc } from '../stories/manuscriptExtensions'
import { useMentionTyping } from '../stories/useMentionTyping'

interface ManuscriptWriterProps {
  universeId: string
  /** The stored text. A change from outside - a recovered draft, a restored version - replaces what the editor holds. */
  value: string
  onChange: (text: string) => void
  readOnly: boolean
  label: string
  placeholder: string
  describedBy?: string
  invalid: boolean
  /** Said to screen readers when a mention is chosen. */
  onAnnounce: (message: string) => void
  /** The editor this component made, once it holds `value`: to focus it, or link names as one undoable edit. */
  onReady: (editor: Editor) => void
}

/**
 * The Write view's editor (ADR 0058 amendment): the scene's prose with each Lore mention drawn as a chip with its name,
 * while what is stored stays the plain text `@[Name](lore:<id>)` - the editor reads and writes that text and nothing else.
 * Typing `@` opens the suggestions at the caret (issue 31). Undo is the editor's own, one step per edit.
 *
 * Copying gives other programs the prose with each mention as its name; pasting plain text reads any stored mention in it
 * as a chip again.
 */
export function ManuscriptWriter({
  universeId,
  value,
  onChange,
  readOnly,
  label,
  placeholder,
  describedBy,
  invalid,
  onAnnounce,
  onReady,
}: ManuscriptWriterProps) {
  const frame = useRef<HTMLDivElement>(null)
  // The text this editor last gave out or was given: a `value` that differs from it came from outside.
  const emitted = useRef(value)
  const suggestionsId = useId()
  // The @ mention being typed: where its `@` is in the document, the words after it, and where to draw the suggestions.
  const [mention, setMention] = useState<{
    start: number
    query: string
    top: number
    left: number
  } | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  // An `@` the author closed the suggestions on with Escape: it stays prose until the caret is at another one.
  const dismissed = useRef<number | null>(null)
  const suggestions = useMentionSearch(universeId, mention?.query ?? null)
  const rows = mention ? suggestions.rows : []
  const active = Math.min(activeSuggestion, Math.max(0, rows.length - 1))

  const { trackMention, chooseMention } = useMentionTyping({
    frame,
    mention,
    setMention,
    setActiveSuggestion,
    dismissed,
    onAnnounce,
  })

  // Read once: the editor takes its content when it is made, and a new object every render would only be parsed for nothing.
  const [content] = useState(() => manuscriptDoc(value))

  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    onUpdate: ({ editor: current }) => {
      const text = manuscriptText(current.getJSON() as ManuscriptNode)
      emitted.current = text
      onChange(text)
      trackMention(current)
    },
    onSelectionUpdate: ({ editor: current }) => trackMention(current),
    onBlur: () => setMention(null),
    editorProps: {
      attributes: {
        class: 'manuscript__text manuscript__writer',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-placeholder': placeholder,
        'aria-keyshortcuts': 'Control+S Meta+S',
        'aria-autocomplete': 'list',
        spellcheck: 'true',
        'data-testid': 'manuscript-editor',
        'data-held': readOnly ? 'true' : 'false',
        ...(readOnly ? { 'aria-readonly': 'true' } : {}),
        ...(value === '' ? { 'data-placeholder': placeholder } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        ...(rows.length > 0
          ? {
              'aria-controls': suggestionsId,
              'aria-activedescendant': `${suggestionsId}-${active}`,
            }
          : {}),
      },
      handleKeyDown: (_view, event) => {
        if (mention === null || event.isComposing || !editor) return false
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          dismissed.current = mention.start
          setMention(null)
          return true
        }
        if (rows.length === 0) return false
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const step = event.key === 'ArrowDown' ? 1 : -1
          setActiveSuggestion((current) => (current + step + rows.length) % rows.length)
          return true
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
          chooseMention(editor, rows[active])
          return true
        }
        return false
      },
      // Other programs get the prose as a reader reads it, a line per line.
      clipboardTextSerializer: (slice) => plainMentions(manuscriptText(asDoc(slice.content))),
      // Plain text is read as the stored form: its lines become lines, its mentions chips.
      clipboardTextParser: (text, _context, _plain, view) =>
        new Slice(view.state.schema.nodeFromJSON(manuscriptDoc(text)).content, 1, 1),
      // Pasted from anywhere but an editor of this app, the text is taken as plain text: a web page's markup would fold
      // its spacing and line breaks.
      handlePaste: (view, event) => {
        const data = event.clipboardData
        const text = data?.getData('text/plain') ?? ''
        if (!data || text === '' || data.getData('text/html').includes('data-pm-slice'))
          return false
        const slice = new Slice(view.state.schema.nodeFromJSON(manuscriptDoc(text)).content, 1, 1)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('paste', true))
        return true
      },
    },
  })

  // A held editor reads but takes no typing. Set without an update: nothing in the text changed.
  useEffect(() => {
    editor?.setEditable(!readOnly, false)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || value === emitted.current) return
    emitted.current = value
    // Not a step to undo: the editor's new starting point.
    editor.chain().setMeta('addToHistory', false).setContent(manuscriptDoc(value)).run()
  }, [editor, value])

  // Reported from the instance this hook hands back, as LoreEditor does: under React's development double mount the first
  // instance made is destroyed.
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })
  useEffect(() => {
    if (editor) ready.current(editor)
  }, [editor])

  return (
    <div className="manuscript__write" ref={frame}>
      <EditorContent editor={editor} />
      {mention && !readOnly && editor ? (
        <MentionSuggestions
          id={suggestionsId}
          search={suggestions}
          query={mention.query}
          active={active}
          position={{ top: mention.top, left: mention.left }}
          onChoose={(row) => chooseMention(editor, row)}
          onHover={setActiveSuggestion}
        />
      ) : null}
    </div>
  )
}

import Link from '@tiptap/extension-link'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { ALLOWED_LINK_SCHEMES, isSafeHref } from '../lore/document'

/**
 * ProseMirror builds DOM nodes from the schema rather than parsing HTML, so authored text
 * can never become markup. The one thing that does reach an attribute is a link href, so
 * only safe schemes are accepted; the API refuses the rest as well.
 */
const extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    protocols: ALLOWED_LINK_SCHEMES,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    isAllowedUri: (url) => isSafeHref(url),
  }),
]

/**
 * The stored document as the editor's content. A document that cannot be read - written before the API validated
 * articles, or by a future editor - opens empty rather than taking the page down with it.
 */
function parseDocument(json: string | null): object | string {
  if (!json) return ''
  try {
    return JSON.parse(json) as object
  } catch {
    return ''
  }
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  function promptForLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const entered = window.prompt(t('lore.editor.linkPrompt'), previous ?? 'https://')
    if (entered === null) return

    if (entered.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    if (!isSafeHref(entered)) {
      window.alert(t('lore.editor.linkUnsafe'))
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: entered.trim() }).run()
  }

  const controls: { label: string; isActive: boolean; run: () => void }[] = [
    {
      label: t('lore.editor.heading'),
      isActive: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: t('lore.editor.bold'),
      isActive: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t('lore.editor.italic'),
      isActive: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t('lore.editor.list'),
      isActive: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: t('lore.editor.numbered'),
      isActive: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t('lore.editor.quote'),
      isActive: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ]

  return (
    <div className="editor__bar" role="toolbar" aria-label={t('lore.editor.formatting')}>
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          className="editor__tool"
          aria-pressed={control.isActive}
          onClick={control.run}
        >
          {control.label}
        </button>
      ))}
      <button
        type="button"
        className="editor__tool"
        aria-pressed={editor.isActive('link')}
        onClick={promptForLink}
      >
        {t('lore.editor.link')}
      </button>
    </div>
  )
}

interface LoreEditorProps {
  value: string | null
  onChange: (json: string) => void

  /**
   * Called once the editor holds `value`, with the editor itself. What it serialises to then is the document as this
   * editor writes it - the right thing to measure unsaved changes against, because a stored document read back may
   * not be byte-identical to what the same editor would write for it.
   */
  onReady?: (editor: Editor) => void

  /** Puts the caret at the end of the document as soon as the editor opens. */
  autofocus?: boolean

  /** Ids of the text that describes the editing surface - its save status, and a length warning. */
  describedBy?: string

  /** The shortcuts the surrounding page gives the editor, announced on the surface. */
  keyShortcuts?: string
}

export function LoreEditor({
  value,
  onChange,
  onReady,
  autofocus = false,
  describedBy,
  keyShortcuts,
}: LoreEditorProps) {
  const { t } = useI18n()
  const editor = useEditor({
    extensions,
    content: parseDocument(value),
    autofocus: autofocus ? 'end' : false,
    onUpdate: ({ editor: current }) => onChange(JSON.stringify(current.getJSON())),
    editorProps: {
      attributes: {
        class: 'editor__surface',
        'data-testid': 'lore-editor',
        'aria-label': t('lore.editor.article'),
        role: 'textbox',
        'aria-multiline': 'true',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(keyShortcuts ? { 'aria-keyshortcuts': keyShortcuts } : {}),
      },
    },
  })

  // Reported from the instance this hook hands back, not from Tiptap's onCreate: under React's development double
  // mount the first instance created is destroyed, and a caller holding it could neither read nor focus the editor it
  // sees. The latest callback is kept in a ref so it is called once per instance, not once per render.
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })

  useEffect(() => {
    if (editor) ready.current?.(editor)
  }, [editor])

  if (!editor) return null

  return (
    <div className="editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

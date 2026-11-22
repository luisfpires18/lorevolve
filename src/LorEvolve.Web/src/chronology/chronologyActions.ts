import { saveChronology } from './api'
import { EraDirection, EraLabelPosition, type Chronology } from './types'
import { t } from '../i18n'
import { draftsFrom, inputOf, type EraDraft } from './eraDrafts'
import type { useChronologyEditorState } from './useChronologyEditorState'

/** The date periods editor's handlers: editing, reordering and adding periods, Discard and Save. */
export function chronologyActions({
  universeId,
  onSaved,
  stored,
  setStored,
  drafts,
  setDrafts,
  setFieldErrors,
  setMessage,
  setBlocked,
  runSave,
  setSaves,
  setMoved,
  focusNew,
  touched,
  created,
  confirmLeave,
}: ReturnType<typeof useChronologyEditorState> & {
  /** The editor's discard guard: true when there is nothing to lose or the author lets it go. */
  confirmLeave: () => Promise<boolean>
  universeId: string
  onSaved: (next: Chronology) => void
}) {
  function change(next: EraDraft[]) {
    touched.current = true
    setDrafts(next)
  }

  function update(index: number, part: Partial<EraDraft>) {
    change(drafts.map((era, position) => (position === index ? { ...era, ...part } : era)))
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= drafts.length) return
    const next = [...drafts]
    const [era] = next.splice(index, 1)
    next.splice(to, 0, era)
    change(next)
    setMoved(
      t('time.periods.moved', {
        name: era.name.trim() || t('time.periods.newCap'),
        position: to + 1,
        total: next.length,
      }),
    )
  }

  function add() {
    created.current += 1
    focusNew.current = `era-new-${created.current}-name`
    change([
      ...drafts,
      {
        key: `new-${created.current}`,
        id: null,
        name: '',
        abbreviation: '',
        direction: EraDirection.Ascending,
        labelPosition: EraLabelPosition.BeforeYear,
        momentCount: 0,
        yearCount: 0,
        sceneCount: 0,
        entryEraCount: 0,
        periodCount: 0,
      },
    ])
  }

  async function discard() {
    if (!(await confirmLeave())) return
    touched.current = false
    setDrafts(draftsFrom(stored))
    setFieldErrors({})
    setMessage(null)
    setBlocked(null)
  }

  async function save() {
    await runSave(async () => {
      setBlocked(null)
      const next = await saveChronology(universeId, inputOf(drafts))
      touched.current = false
      setStored(next)
      setDrafts(draftsFrom(next))
      onSaved(next)
      setSaves((count) => count + 1)
    })
  }

  return { change, update, move, add, discard, save }
}

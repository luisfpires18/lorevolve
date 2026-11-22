import { removeCalendar, saveCalendar } from './api'
import type { Chronology, ChronologyCalendar } from './types'
import { t } from '../i18n'
import { confirmAction } from '../lib/confirm'
import { draftsFrom, inputOf, type Mode, type MonthDraft } from './monthDrafts'
import type { useCalendarEditorState } from './useCalendarEditorState'

/** The calendar editor's handlers: editing, adding, reordering and removing months, Discard and Save. */
export function calendarActions({
  universeId,
  onSaved,
  stored,
  storedMode,
  mode,
  setMode,
  drafts,
  setDrafts,
  setFieldErrors,
  setMessage,
  runSave,
  setSaves,
  setMoved,
  touched,
  created,
  focusNew,
  confirmLeave,
}: ReturnType<typeof useCalendarEditorState> & {
  /** The editor's discard guard: true when there is nothing to lose or the author lets it go. */
  confirmLeave: () => Promise<boolean>
  universeId: string
  onSaved: (next: Chronology) => void
  stored: ChronologyCalendar | null
  storedMode: Mode
}) {
  function change(next: MonthDraft[]) {
    touched.current = true
    setDrafts(next)
  }

  function update(index: number, part: Partial<MonthDraft>) {
    change(drafts.map((month, position) => (position === index ? { ...month, ...part } : month)))
  }

  function newMonth(): MonthDraft {
    created.current += 1
    return {
      key: `new-${created.current}`,
      id: null,
      name: '',
      abbreviation: '',
      days: '30',
      useCount: 0,
      maxDayUsed: null,
    }
  }

  function add() {
    const month = newMonth()
    focusNew.current = `month-${month.key}-name`
    change([...drafts, month])
  }

  function choose(next: Mode) {
    touched.current = true
    setMode(next)
    setMessage(null)
    setFieldErrors({})
    // A custom calendar starts with one month to name, rather than an empty list to puzzle over.
    if (next === 'custom' && drafts.length === 0) {
      const month = newMonth()
      focusNew.current = `month-${month.key}-name`
      setDrafts([month])
    }
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= drafts.length) return
    const next = [...drafts]
    const [month] = next.splice(index, 1)
    next.splice(to, 0, month)
    change(next)
    setMoved(
      t('time.calendar.moved', {
        name: month.name.trim() || t('time.calendar.newMonthCap'),
        position: to + 1,
        total: next.length,
      }),
    )
  }

  function remove(index: number) {
    const month = drafts[index]
    // A calendar keeps at least one month; to have none is simple dates, chosen above.
    if (month.useCount > 0 || drafts.length === 1) return
    change(drafts.filter((_, position) => position !== index))
    setMoved(
      t('time.calendar.removed', { name: month.name.trim() || t('time.calendar.newMonthCap') }),
    )
  }

  async function discard() {
    if (!(await confirmLeave())) return
    touched.current = false
    setMode(storedMode)
    setDrafts(draftsFrom(stored))
    setFieldErrors({})
    setMessage(null)
  }

  async function save() {
    if (
      mode === 'simple' &&
      !(await confirmAction({
        title: t('time.calendar.switchConfirm.title'),
        message: t('time.calendar.switchConfirm.message'),
        confirmLabel: t('time.calendar.switchConfirm.confirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }

    await runSave(async () => {
      const next =
        mode === 'custom'
          ? await saveCalendar(universeId, inputOf(drafts))
          : await removeCalendar(universeId)
      touched.current = false
      setMode(next.calendar ? 'custom' : 'simple')
      setDrafts(draftsFrom(next.calendar))
      onSaved(next)
      setSaves((count) => count + 1)
    })
  }

  return { change, update, newMonth, add, choose, move, remove, discard, save }
}

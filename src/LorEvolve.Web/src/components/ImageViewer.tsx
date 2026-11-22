import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { IconButton } from './IconButton'

/**
 * An entry's picture, whole: the original the author uploaded, fitted inside the window with its
 * proportions kept - never cropped, never stretched, never the square thumbnail.
 *
 * A native modal `<dialog>`, as the cropper is: `showModal` makes everything behind it inert, keeps
 * Tab inside it and turns Escape into a close. Mounted only while open, so opening it is an ordinary
 * render and closing it unmounts it; the caller hands the focus back to whatever opened it. Transient
 * page state - no address, so Back is never spent on a picture.
 *
 * A press on the dark surround closes it; a press on the picture does not. No gallery, zoom or
 * download: there is one picture, and the browser already shows it well.
 */
export function ImageViewer({
  src,
  name,
  width,
  height,
  onClose,
}: {
  /** The original's address, the one the page already shows - not built from anything authored. */
  src: string
  /** The entry's name, which titles the dialog and describes the picture. */
  name: string
  width: number
  height: number
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useReturnFocus()
  const { dialogProps } = useDrawerGuard(false, '', onClose)

  useEffect(() => {
    const element = dialog.current
    if (!element || element.open) return
    element.showModal()
    return () => {
      // Under StrictMode the effect runs twice; closing on the first cleanup lets the second open it again.
      if (element.open) element.close()
    }
  }, [])

  return (
    <dialog
      className="viewer"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={dialogProps.onCancel}
      onKeyDown={(event) => {
        dialogProps.onKeyDown(event)
        // A modal dialog makes the page behind it inert, but Tab can still leave for the browser's own
        // chrome. Kept inside: the dialog holds one control, so Tab stays on it.
        if (event.key !== 'Tab') return
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('button, [href], [tabindex]'),
        ]
        const at = controls.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey ? at - 1 : at + 1
        if (next < 0 || next >= controls.length) {
          event.preventDefault()
          controls[event.shiftKey ? controls.length - 1 : 0]?.focus()
        }
      }}
      onClick={(event) => {
        // The surround, not the picture or the bar: only a press on the dialog's own box or stage.
        const target = event.target as HTMLElement
        if (target === event.currentTarget || target.classList.contains('viewer__stage')) {
          onClose()
        }
      }}
      data-testid="image-viewer"
    >
      <div className="viewer__bar">
        <h2 className="viewer__title" id={titleId}>
          <bdi>{name}</bdi>
        </h2>
        <IconButton
          icon={X}
          label={t('universe.imageViewer.close')}
          className="viewer__close"
          onClick={onClose}
          autoFocus
          data-testid="image-viewer-close"
        />
      </div>
      <div className="viewer__stage">
        <img
          className="viewer__image"
          src={src}
          alt={name}
          width={width}
          height={height}
          decoding="async"
          data-testid="image-viewer-image"
        />
      </div>
    </dialog>
  )
}

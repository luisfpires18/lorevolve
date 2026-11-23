import type { InputHTMLAttributes, RefObject } from 'react'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import { IMAGE_ACCEPT } from '../lib/imageCrop'
import { buttonClass } from '../lib/buttonClass'
import { ActionIcon } from './ActionIcon'
import { Button } from './Button'

// Two looks for the same pick control: the entry and Image field one, and the avatar and cover one.
const CLASSES = {
  imagefield: { input: 'imagefield__input visually-hidden', pick: 'imagefield__pick' },
  avatar: { input: 'avatar__input', pick: 'avatar__pick' },
}

/**
 * The actions of a picture control: the file input and its pick label (Add, or Replace once there is
 * a picture), then Reframe and Remove for a picture that is there. Draws only these, as siblings in
 * the caller's row; the preview, the hint and the cropper stay with the caller.
 *
 * The input comes first so the label can be styled from its state - focus and disabled both travel
 * forwards through a sibling selector and not backwards.
 *
 * `variant` picks the look (`imagefield` by default, `avatar` for the Profile photo and covers),
 * `control` is a Field's input props, `canRemove` hides Remove for a picture that cannot go, and
 * `removeTone` keeps each place's own Remove look. Use with `usePictureFraming`.
 * Catalogue: `docs/design/ui-components.md`.
 */
export function PictureActions({
  variant = 'imagefield',
  input,
  control,
  inputId,
  hasPicture,
  busy,
  disabled,
  onFile,
  onReframe,
  onRemove,
  canRemove = true,
  removeTone = 'danger-quiet',
  labels,
  testIds,
}: {
  variant?: keyof typeof CLASSES
  input: RefObject<HTMLInputElement | null>
  control?: InputHTMLAttributes<HTMLInputElement>
  inputId: string
  hasPicture: boolean
  busy: boolean
  disabled?: boolean
  onFile: (file: File | undefined) => void
  onReframe: () => void
  onRemove: () => void
  canRemove?: boolean
  removeTone?: 'danger-quiet' | 'secondary'
  labels: { add: string; replace: string; reframe: string; remove: string; removing: string }
  testIds: { input: string; pick?: string; reframe: string; remove: string }
}) {
  const classes = CLASSES[variant]
  const locked = busy || disabled

  return (
    <>
      <input
        ref={input}
        id={inputId}
        {...control}
        className={classes.input}
        type="file"
        accept={IMAGE_ACCEPT}
        disabled={locked}
        onChange={(event) => onFile(event.target.files?.[0])}
        data-testid={testIds.input}
      />

      <label
        className={buttonClass({ tone: 'secondary', className: classes.pick })}
        htmlFor={inputId}
        data-testid={testIds.pick}
      >
        <ActionIcon icon={hasPicture ? ImageUp : ImagePlus} />
        {hasPicture ? labels.replace : labels.add}
      </label>

      {hasPicture ? (
        <Button
          tone="secondary"
          icon={Crop}
          disabled={locked}
          onClick={onReframe}
          data-testid={testIds.reframe}
        >
          {labels.reframe}
        </Button>
      ) : null}

      {hasPicture && canRemove ? (
        <Button
          tone={removeTone}
          icon={ImageMinus}
          disabled={locked}
          onClick={onRemove}
          data-testid={testIds.remove}
        >
          {busy ? labels.removing : labels.remove}
        </Button>
      ) : null}
    </>
  )
}

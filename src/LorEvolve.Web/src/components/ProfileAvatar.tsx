import type { ImageCrop } from '../lib/imageCrop'
import {
  profileImageUrl,
  removeProfileImage,
  setProfileImage,
  setProfileThumbnail,
} from '../profile/api'
import type { ProfileImageRef } from '../profile/types'
import { useProfileImage } from '../profile/useProfileImage'
import { useI18n } from '../i18n'
import { Avatar } from './Avatar'
import { ImageCropDialog, type SaveStage } from './ImageCropDialog'
import { PictureActions } from './PictureActions'
import { usePictureFraming } from '../lib/usePictureFraming'
import { FormMessage } from './FormMessage'

/**
 * The account's picture on the Profile screen: the circle, and the four things that can be done
 * to it.
 *
 * The circle is the same size and in the same place whether or not there is a photo in it, so the
 * page does not jump when one arrives or goes. Without one it carries the account's initial - a
 * monogram, not a stock silhouette, because a silhouette says "a person" and an initial says
 * "you". `Avatar` draws both, here and in the account menu, so they cannot drift.
 *
 * Every photo goes through the cropper before it goes anywhere, so a cancelled crop uploads
 * nothing. The whole picture is always kept; the square is only what the avatar shows.
 *
 * What is written is reported to `useProfileImage` rather than held here, so the rail, the folded
 * mobile bar and the universes header change at the same moment this circle does.
 */
export function ProfileAvatar({ name }: { name: string }) {
  const { t } = useI18n()
  const { image, changed } = useProfileImage()

  const { input, error, setError, busy, framing, setFraming, choose, remove } =
    usePictureFraming<ProfileImageRef>({ tooBigKey: 'account.avatar.tooBig' })

  function reframe() {
    if (!image) return
    setError(null)
    setFraming({ kind: 'stored', image, source: profileImageUrl(image, 'original') })
  }

  async function keep(crop: ImageCrop, report: (stage: SaveStage) => void) {
    if (!framing) return

    if (framing.kind === 'stored') {
      // Four numbers, no file. There is nothing to count, so the dialog is told straight away that
      // this is server work - a byte percentage here would be invented.
      report({ kind: 'working' })
      changed(await setProfileThumbnail(framing.image.assetId, crop))
    } else {
      report({ kind: 'sending', ratio: 0 })
      changed(
        await setProfileImage(framing.file, crop, ({ ratio }) => {
          // The last byte out is not the photo saved: the server still has to decode it, cut the
          // square and store both. That is what the switch to an indeterminate stage says.
          report(ratio !== null && ratio >= 1 ? { kind: 'working' } : { kind: 'sending', ratio })
        }),
      )
    }

    setFraming(null)
  }

  return (
    <div className="avatar" data-testid="profile-avatar-field">
      <Avatar image={image} name={name} className="avatar__photo" testId="profile-avatar" />

      <div className="actions actions--tight avatar__actions">
        <PictureActions
          variant="avatar"
          input={input}
          inputId="profile-photo-input"
          hasPicture={Boolean(image)}
          busy={busy}
          onFile={(file) => void choose(file)}
          onReframe={reframe}
          onRemove={() =>
            void remove({
              stored: true,
              run: removeProfileImage,
              done: () => changed(null),
              failed: () => t('account.avatar.removeFailed'),
            })
          }
          removeTone="secondary"
          labels={{
            add: t('account.avatar.upload'),
            replace: t('account.avatar.replace'),
            reframe: t('account.avatar.edit'),
            remove: t('account.avatar.remove'),
            removing: t('account.avatar.removing'),
          }}
          testIds={{
            input: 'profile-photo-input',
            pick: 'profile-photo-pick',
            reframe: 'profile-photo-reframe',
            remove: 'profile-photo-remove',
          }}
        />
      </div>

      <p className="avatar__hint">{t('account.avatar.hint')}</p>

      {error ? <FormMessage testId="profile-photo-error">{error}</FormMessage> : null}

      {framing ? (
        <ImageCropDialog
          // A new picture is a new cropper, never the last one's state carried over.
          key={framing.source}
          source={framing.source}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : null}
          title={
            framing.kind === 'stored'
              ? t('account.avatar.editTitle')
              : t('account.avatar.frameTitle')
          }
          confirmLabel={
            framing.kind === 'stored' ? t('account.avatar.save') : t('account.avatar.confirmUpload')
          }
          workingLabel={
            framing.kind === 'stored'
              ? t('account.avatar.updating')
              : t('account.avatar.processing')
          }
          hint={t('account.avatar.cropHint')}
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </div>
  )
}

import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { authorPath } from '../portal/api'
import { useProfileImage } from '../profile/useProfileImage'
import { getPublicAuthorSettings, setPublicAuthorPhoto } from '../publishing/api'
import type { PublicAuthorSettings } from '../publishing/types'
import { useI18n } from '../i18n'

/**
 * The Profile's view of the account's public author page (ADR 0037): where it is, whether anyone can see it, and the
 * one choice about it this screen owns - whether the account's photo is shown there. The photo is private unless this is
 * ticked, and replacing it makes it private again: consent is for one picture. The page itself belongs to the portal;
 * this stays a workspace screen.
 */
export function PublicAuthorSection() {
  const { t, tx } = useI18n()
  const photoId = useId()
  const { image } = useProfileImage()
  const [settings, setSettings] = useState<PublicAuthorSettings | null>(null)
  const [busy, setBusy] = useState(false)
  // The choice as the author just made it, while the server confirms it - so the box does not jump back and forth.
  const [pending, setPending] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Read again whenever the photo changes: a replacement is private again, a removal leaves nothing to show.
  const photoKey = image?.assetId ?? 'none'
  useEffect(() => {
    const controller = new AbortController()
    getPublicAuthorSettings(controller.signal)
      .then(setSettings)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('portal.authorSection.loadFailed'))
      })
    return () => {
      controller.abort()
    }
  }, [photoKey, t])

  if (!settings) {
    return message ? (
      <p className="form__message" role="alert">
        {message}
      </p>
    ) : null
  }

  async function toggle(isPublic: boolean) {
    setBusy(true)
    setPending(isPublic)
    setMessage(null)
    try {
      setSettings(await setPublicAuthorPhoto(isPublic))
      setAnnouncement(
        isPublic ? t('portal.authorSection.photoShown') : t('portal.authorSection.photoHidden'),
      )
    } catch {
      setMessage(t('portal.authorSection.changeFailed'))
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  return (
    <div className="profile__author" data-testid="public-author-settings">
      <h3 className="profile__subtitle">{t('portal.authorSection.title')}</h3>
      {settings.authorSlug && settings.hasPublicWorld ? (
        <p className="settings__note">
          {tx('portal.authorSection.readersFind', {
            link: (
              <Link to={authorPath(settings.authorSlug)} data-testid="view-author-page">
                {t('portal.authorSection.readersFindLink')}
              </Link>
            ),
          })}
        </p>
      ) : (
        <p className="settings__note" data-testid="author-page-hidden">
          {settings.authorSlug
            ? t('portal.authorSection.hiddenAgain')
            : t('portal.authorSection.hiddenFirst')}
        </p>
      )}

      <label className="check" htmlFor={photoId}>
        <input
          id={photoId}
          type="checkbox"
          checked={pending ?? settings.photoIsPublic}
          disabled={busy || !settings.hasPhoto}
          onChange={(event) => void toggle(event.target.checked)}
          aria-describedby={`${photoId}-hint`}
          data-testid="public-photo-toggle"
        />
        <span>{t('portal.authorSection.showPhoto')}</span>
      </label>
      <p className="field__hint" id={`${photoId}-hint`}>
        {settings.hasPhoto
          ? t('portal.authorSection.photoHintHas')
          : t('portal.authorSection.photoHintNone')}
      </p>
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  )
}

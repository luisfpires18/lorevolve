import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { authorPath } from '../portal/api'
import { useProfileImage } from '../profile/useProfileImage'
import { getPublicAuthorSettings, setPublicAuthorPhoto } from '../publishing/api'
import type { PublicAuthorSettings } from '../publishing/types'

/**
 * The Profile's view of the account's public author page (ADR 0037): where it is, whether anyone can see it, and the
 * one choice about it this screen owns - whether the account's photo is shown there. The photo is private unless this is
 * ticked, and replacing it makes it private again: consent is for one picture. The page itself belongs to the portal;
 * this stays a workspace screen.
 */
export function PublicAuthorSection() {
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
        if (!controller.signal.aborted) setMessage('Your author page settings could not be loaded.')
      })
    return () => {
      controller.abort()
    }
  }, [photoKey])

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
        isPublic ? 'Your photo is shown on your author page.' : 'Your photo is no longer shown.',
      )
    } catch {
      setMessage('That could not be changed. Try again.')
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  return (
    <div className="profile__author" data-testid="public-author-settings">
      <h3 className="profile__subtitle">Author page</h3>
      {settings.authorSlug && settings.hasPublicWorld ? (
        <p className="settings__note">
          Readers find your public worlds on{' '}
          <Link to={authorPath(settings.authorSlug)} data-testid="view-author-page">
            your author page
          </Link>
          .
        </p>
      ) : (
        <p className="settings__note" data-testid="author-page-hidden">
          {settings.authorSlug
            ? 'Your author page appears again while one of your universes is public.'
            : 'Your author page appears when you publish your first universe.'}
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
        <span>Show my photo on my author page</span>
      </label>
      <p className="field__hint" id={`${photoId}-hint`}>
        {settings.hasPhoto
          ? 'Off unless you turn it on. Replacing your photo turns it off again.'
          : 'Add a photo above first. Without one, your author page shows your initial.'}
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

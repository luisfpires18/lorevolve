import { Route } from 'react-router-dom'
import { RequireGuest } from '../auth/routes'
import { PublicLayout } from '../components/PublicLayout'
import {
  ExplorePage,
  ForgotPasswordPage,
  InvitationPage,
  LoginPage,
  PublicAuthorPage,
  PublicLorePage,
  PublicStoryPage,
  PublicWorldPage,
  RegisterPage,
  ResetPasswordPage,
} from '../screens'
import { asScreen } from './screenHolds'
import { ExploreRedirect } from './redirects'

export function publicRoutes() {
  return (
    <>
      {/* The public portal: outside both guards, so it answers signed in or out, and outside the
              workspace, so none of its chrome is mounted. It reads only the anonymous API (ADR 0036). Explore is the
              front door, at `/` (ADR 0069); `/explore`, its old address, goes there. */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={asScreen('explore', <ExplorePage />)} />
        <Route path="/explore" element={<ExploreRedirect />} />
        <Route path="/worlds/:slug" element={asScreen('world', <PublicWorldPage />)} />
        <Route
          path="/worlds/:slug/lore/:loreSlug"
          element={asScreen('public-lore', <PublicLorePage />)}
        />
        <Route
          path="/worlds/:slug/stories/:storySlug"
          element={asScreen('public-story', <PublicStoryPage />)}
        />
        <Route path="/authors/:authorSlug" element={asScreen('author', <PublicAuthorPage />)} />
      </Route>

      {/* An invitation link: outside both guards, because signed out it must still say what it is - and only that -
              and offer a way in that comes back here (ADR 0041 amendment). */}
      <Route path="/invite/:token" element={asScreen('invite', <InvitationPage />)} />

      <Route element={<RequireGuest />}>
        <Route path="/login" element={asScreen('login', <LoginPage />)} />
        <Route path="/register" element={asScreen('register', <RegisterPage />)} />
        <Route path="/forgot-password" element={asScreen('forgot', <ForgotPasswordPage />)} />
      </Route>

      {/* A password reset link (#69): outside both guards, so it works from any browser, signed in or not. */}
      <Route path="/reset-password" element={asScreen('reset', <ResetPasswordPage />)} />
    </>
  )
}

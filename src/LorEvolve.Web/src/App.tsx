import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ConfirmHost } from './components/ConfirmDialog'
import { Root } from './routes/Root'
import { AppCrashed } from './routes/AppCrashed'

/**
 * A data router with one catch-all route, and the app's own `<Routes>` inside it unchanged. It is a data router for one
 * reason: only a data router can hold the browser's Back and Forward and put the history back where it was, and unsaved
 * writing needs that (`HistoryLeaveGuard`, ADR 0028). Every route, layout and link resolves as it did under
 * `BrowserRouter`.
 */
const router = createBrowserRouter([{ path: '*', element: <Root />, errorElement: <AppCrashed /> }])

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
    </>
  )
}

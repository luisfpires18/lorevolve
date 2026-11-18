import { Route } from 'react-router-dom'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import {
  AiChangesPage,
  ConnectAuthorizePage,
  ProfilePage,
  ProjectPage,
  ProjectsPage,
  UniversesPage,
} from '../screens'
import { asScreen, asSection } from './screenHolds'

export function accountRoutes() {
  return (
    <>
      {/* An AI app's request to read a universe (ADR 0046), handed here by the authorization endpoint. Signed in,
                because only a member can approve; outside the workspace, because it is a decision, not a place. */}
      <Route path="/connect/authorize" element={asScreen('connect', <ConnectAuthorizePage />)} />
      {/* My workspace's account-level screens share one frame (`WorkspaceLayout`). A universe, below, is a level
                deeper and keeps its own rail and sidebar instead. */}
      <Route element={<WorkspaceLayout />}>
        <Route path="/app" element={asSection('universes', <UniversesPage />)} />
        <Route path="/app/profile" element={asSection('profile', <ProfilePage />)} />
        <Route path="/app/projects" element={asSection('projects', <ProjectsPage />)} />
        <Route path="/app/projects/new" element={asSection('project', <ProjectPage isNew />)} />
        <Route path="/app/projects/:projectId/*" element={asSection('project', <ProjectPage />)} />
        <Route path="/app/ai-changes" element={asSection('ai-changes', <AiChangesPage />)} />
      </Route>
    </>
  )
}

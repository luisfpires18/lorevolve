import { Route } from 'react-router-dom'
import { RoleGate } from '../components/RoleGate'
import {
  AiChangePage,
  AiChangesPage,
  CanonPage,
  UniversePublish,
  UniverseSettings,
  UniverseTrash,
  UniverseTypes,
} from '../screens'
import { asSection } from './screenHolds'

export function universeToolRoutes() {
  return (
    <>
      <Route path="canon" element={asSection('canon', <CanonPage />)} />
      <Route path="ai-changes" element={asSection('ai-changes', <AiChangesPage inUniverse />)} />
      <Route path="ai-changes/:proposalId" element={asSection('ai-change', <AiChangePage />)} />
      <Route path="types" element={asSection('types', <UniverseTypes />)} />
      <Route
        path="trash"
        element={asSection(
          'trash',
          <RoleGate need="manageTrash">
            <UniverseTrash />
          </RoleGate>,
        )}
      />
      <Route
        path="publish"
        element={asSection(
          'publish',
          <RoleGate need="publish">
            <UniversePublish />
          </RoleGate>,
        )}
      />
      <Route
        path="settings"
        element={asSection(
          'settings',
          <RoleGate need="manageUniverse">
            <UniverseSettings />
          </RoleGate>,
        )}
      />
    </>
  )
}

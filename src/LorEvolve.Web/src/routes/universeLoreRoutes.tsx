import { Route } from 'react-router-dom'
import { RoleGate } from '../components/RoleGate'
import UniverseOverview from '../pages/UniverseOverview'
import { EntityPage, FamilyTreePage, LorePage, MapPage, MapsPage, MassCreatePage } from '../screens'
import { asSection } from './screenHolds'

export function universeLoreRoutes() {
  return (
    <>
      <Route index element={<UniverseOverview />} />
      <Route path="lore" element={asSection('lore', <LorePage />)} />
      <Route
        path="lore/new"
        element={asSection(
          'entry',
          <RoleGate need="editContent">
            <EntityPage />
          </RoleGate>,
        )}
      />
      <Route
        path="lore/mass-create"
        element={asSection(
          'mass-create',
          <RoleGate need="editContent">
            <MassCreatePage />
          </RoleGate>,
        )}
      />
      <Route
        path="lore/:entityId"
        element={asSection(
          'entry',
          <RoleGate>
            <EntityPage />
          </RoleGate>,
        )}
      />
      <Route
        path="lore/:entityId/progression"
        element={asSection(
          'entry',
          <RoleGate>
            <EntityPage view="progression" />
          </RoleGate>,
        )}
      />
      <Route
        path="lore/:entityId/relations"
        element={asSection(
          'entry',
          <RoleGate>
            <EntityPage view="relations" />
          </RoleGate>,
        )}
      />
      <Route
        path="lore/:entityId/history"
        element={asSection(
          'entry',
          <RoleGate need="manageHistory">
            <EntityPage view="history" />
          </RoleGate>,
        )}
      />
      <Route path="maps" element={asSection('maps', <MapsPage />)} />
      <Route path="maps/:mapId" element={asSection('map', <MapPage />)} />
      <Route path="family-tree" element={asSection('family-tree', <FamilyTreePage />)} />
      <Route path="family-tree/:entityId" element={asSection('family-tree', <FamilyTreePage />)} />
    </>
  )
}

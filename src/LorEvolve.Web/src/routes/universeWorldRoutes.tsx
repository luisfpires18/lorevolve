import { Navigate, Route } from 'react-router-dom'
import { RoleGate } from '../components/RoleGate'
import {
  ChronologyPage,
  TimelinePage,
  WorldLogicPage,
  SystemEditorPage,
  WorldRulePage,
  WorldRulesPage,
} from '../screens'
import { asSection } from './screenHolds'

export function universeWorldRoutes() {
  return (
    <>
      <Route path="timeline" element={asSection('timeline', <TimelinePage />)} />
      <Route path="world-logic" element={asSection('world-logic', <WorldLogicPage />)} />
      <Route
        path="world-logic/systems/new"
        element={asSection(
          'world-logic',
          <RoleGate need="editContent">
            <SystemEditorPage isNew />
          </RoleGate>,
        )}
      />
      <Route
        path="world-logic/systems/:systemId"
        element={asSection(
          'world-logic',
          <RoleGate need="editContent">
            <SystemEditorPage />
          </RoleGate>,
        )}
      />
      {/* Every world rule address still works, so nothing an author linked or bookmarked broke (#152). */}
      <Route path="world-rules" element={asSection('world-rules', <WorldRulesPage />)} />
      {/* Chronology is Timeline's configuration view (#200); its old address still resolves, by redirect. */}
      <Route path="timeline/configuration" element={asSection('chronology', <ChronologyPage />)} />
      <Route
        path="chronology"
        element={<Navigate to="../timeline/configuration" relative="path" replace />}
      />
      <Route
        path="world-rules/new"
        element={asSection(
          'rule',
          <RoleGate need="editContent">
            <WorldRulePage isNew />
          </RoleGate>,
        )}
      />
      <Route
        path="world-rules/:ruleId"
        element={asSection(
          'rule',
          <RoleGate>
            <WorldRulePage />
          </RoleGate>,
        )}
      />
    </>
  )
}

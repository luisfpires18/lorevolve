import { Route } from 'react-router-dom'
import { RoleGate } from '../components/RoleGate'
import { IdeaBoardPage, IdeaBoardsPage, IdeaPage, IdeasPage } from '../screens'
import { asSection } from './screenHolds'

export function universeIdeaRoutes() {
  return (
    <>
      <Route
        path="ideas"
        element={asSection(
          'ideas',
          <RoleGate need="keepIdeas">
            <IdeasPage inUniverse />
          </RoleGate>,
        )}
      />
      <Route
        path="ideas/new"
        element={asSection(
          'idea',
          <RoleGate need="keepIdeas">
            <IdeaPage inUniverse isNew />
          </RoleGate>,
        )}
      />
      <Route
        path="ideas/:ideaId"
        element={asSection(
          'idea',
          <RoleGate need="keepIdeas">
            <IdeaPage inUniverse />
          </RoleGate>,
        )}
      />
      <Route
        path="ideas/boards"
        element={asSection(
          'ideas',
          <RoleGate need="keepIdeas">
            <IdeaBoardsPage inUniverse />
          </RoleGate>,
        )}
      />
      <Route
        path="ideas/boards/new"
        element={asSection(
          'board',
          <RoleGate need="keepIdeas">
            <IdeaBoardPage inUniverse isNew />
          </RoleGate>,
        )}
      />
      <Route
        path="ideas/boards/:boardId"
        element={asSection(
          'board',
          <RoleGate need="keepIdeas">
            <IdeaBoardPage inUniverse />
          </RoleGate>,
        )}
      />
    </>
  )
}

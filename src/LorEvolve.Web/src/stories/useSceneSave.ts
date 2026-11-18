import { isChangedElsewhere } from '../lib/editConflict'
import { ApiError } from '../lib/api'
import { createScene, SCENE_CHANGED, updateScene } from './api'
import { suggestSceneChanges } from '../suggestions/api'
import { inputOf, type SceneDraft } from './sceneDraft'
import type { Scene } from './types'
import type { Dispatch, SetStateAction } from 'react'
import type { useI18n } from '../i18n'

/** Sends the scene form: saves the scene, or sends it as a suggestion, and says what went wrong. */
export function useSceneSave({
  universeId,
  storyId,
  scene,
  suggesting,
  onSuggested,
  onSaved,
  base,
  draft,
  reckonsInEras,
  custom,
  setMessage,
  setFieldErrors,
  setConflict,
  setIsSaving,
  t,
}: {
  universeId: string
  storyId: string
  scene: Scene | null
  suggesting: boolean
  onSuggested?: () => void
  onSaved: (scene: Scene) => void
  base: { draft: SceneDraft; version: number | undefined }
  draft: SceneDraft
  reckonsInEras: boolean
  custom: boolean
  setMessage: Dispatch<SetStateAction<string | null>>
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>
  setConflict: Dispatch<SetStateAction<boolean>>
  setIsSaving: Dispatch<SetStateAction<boolean>>
  t: ReturnType<typeof useI18n>['t']
}) {
  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const input = inputOf(draft, reckonsInEras, custom)

    try {
      if (suggesting && scene && onSuggested) {
        await suggestSceneChanges(universeId, storyId, scene.id, {
          ...input,
          expectedVersion: base.version,
        })
        onSuggested()
        return
      }
      const saved = scene
        ? await updateScene(universeId, storyId, scene.id, {
            ...input,
            expectedVersion: base.version,
          })
        : await createScene(universeId, storyId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SCENE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : suggesting
              ? t('stories.sceneForm.detailsToSend')
              : t('stories.sceneForm.detailsToSave'),
        )
      } else {
        setMessage(
          suggesting ? t('stories.sceneForm.failedSend') : t('stories.sceneForm.failedSave'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }
  return { save }
}

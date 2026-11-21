import { isChangedElsewhere } from '../lib/editConflict'
import { useFormSave } from '../lib/useFormSave'
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
  version,
  draft,
  reckonsInEras,
  custom,
  setConflict,
  t,
}: {
  universeId: string
  storyId: string
  scene: Scene | null
  suggesting: boolean
  onSuggested?: () => void
  onSaved: (scene: Scene) => void
  version: number | undefined
  draft: SceneDraft
  reckonsInEras: boolean
  custom: boolean
  setConflict: Dispatch<SetStateAction<boolean>>
  t: ReturnType<typeof useI18n>['t']
}) {
  const form = useFormSave({
    refusal: (error) => {
      if (!isChangedElsewhere(error, SCENE_CHANGED)) return false
      setConflict(true)
      return true
    },
    needChange: suggesting
      ? t('stories.sceneForm.detailsToSend')
      : t('stories.sceneForm.detailsToSave'),
    failed: suggesting ? t('stories.sceneForm.failedSend') : t('stories.sceneForm.failedSave'),
  })

  async function save() {
    const input = inputOf(draft, reckonsInEras, custom)

    await form.save(async () => {
      setConflict(false)
      if (suggesting && scene && onSuggested) {
        await suggestSceneChanges(universeId, storyId, scene.id, {
          ...input,
          expectedVersion: version,
        })
        onSuggested()
        return
      }
      const saved = scene
        ? await updateScene(universeId, storyId, scene.id, {
            ...input,
            expectedVersion: version,
          })
        : await createScene(universeId, storyId, input)
      onSaved(saved)
    })
  }
  return { save, fieldErrors: form.fieldErrors, message: form.message, isSaving: form.isSaving }
}

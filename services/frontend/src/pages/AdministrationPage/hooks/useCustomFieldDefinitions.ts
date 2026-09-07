import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import {
  createDefinition,
  deactivateDefinition,
  getCustomFieldDefinitionError,
  listDefinitions,
  updateDefinition,
  type CustomFieldDataType,
  type CustomFieldDefinition,
  type CustomFieldDefinitionError,
  type CustomFieldVisibility,
} from '@/api/customFieldDefinitions'

interface AsyncState {
  busy: boolean
  error: CustomFieldDefinitionError | null
}

const initialAsyncState: AsyncState = { busy: false, error: null }

export const useCustomFieldDefinitions = () => {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<CustomFieldDefinitionError | null>(null)
  const [mutation, setMutation] = useState<AsyncState>(initialAsyncState)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await listDefinitions(signal)
      if (signal?.aborted) {
        return
      }
      setDefinitions(result)
    } catch (error) {
      if (signal?.aborted || axios.isCancel(error)) {
        return
      }
      setLoadError(getCustomFieldDefinitionError(error))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  const runMutation = async (operation: () => Promise<unknown>) => {
    setMutation({ busy: true, error: null })
    try {
      await operation()
      await load()
    } catch (error) {
      setMutation({ busy: false, error: getCustomFieldDefinitionError(error) })
      return false
    }
    setMutation(initialAsyncState)
    return true
  }

  const create = (
    name: string,
    dataType: CustomFieldDataType,
    visibility: CustomFieldVisibility,
  ) => runMutation(() => createDefinition(name, dataType, visibility))

  const update = (
    id: string,
    patch: { name?: string; visibility?: CustomFieldVisibility },
  ) => runMutation(() => updateDefinition(id, patch))

  const deactivate = (id: string) => runMutation(() => deactivateDefinition(id))

  return {
    definitions,
    loading,
    loadError,
    mutation,
    create,
    update,
    deactivate,
  }
}

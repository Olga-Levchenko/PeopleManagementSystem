import axios from 'axios'
import { apiClient } from '@/api/client'

export type CustomFieldDataType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN'
export type CustomFieldVisibility = 'MANAGEMENT' | 'EMPLOYEE' | 'COLLEAGUE'

export interface CustomFieldDefinition {
  id: string
  name: string
  dataType: CustomFieldDataType
  visibility: CustomFieldVisibility
  isActive: boolean
}

export type CustomFieldDefinitionError =
  | 'validation'
  | 'unauthorized'
  | 'permission'
  | 'missing'
  | 'conflict'
  | 'unavailable'
  | 'unknown'

export const getCustomFieldDefinitionError = (error: unknown): CustomFieldDefinitionError => {
  if (!axios.isAxiosError(error)) {
    return 'unknown'
  }

  if (!error.response) {
    return 'unavailable'
  }

  switch (error.response.status) {
    case 400:
      return 'validation'
    case 401:
      return 'unauthorized'
    case 403:
      return 'permission'
    case 404:
      return 'missing'
    case 409:
      return 'conflict'
    case 503:
      return 'unavailable'
    default:
      return 'unknown'
  }
}

export const listDefinitions = (signal?: AbortSignal) =>
  apiClient.get<CustomFieldDefinition[]>('/api/v1/custom-field-definitions', { signal })

export const createDefinition = (
  name: string,
  dataType: CustomFieldDataType,
  visibility: CustomFieldVisibility,
) =>
  apiClient.post<CustomFieldDefinition>('/api/v1/custom-field-definitions', {
    name,
    dataType,
    visibility,
  })

export const updateDefinition = (
  id: string,
  patch: { name?: string; visibility?: CustomFieldVisibility },
) =>
  apiClient.patch<CustomFieldDefinition>(
    `/api/v1/custom-field-definitions/${encodeURIComponent(id)}`,
    patch,
  )

export const deactivateDefinition = (id: string) =>
  apiClient.delete<CustomFieldDefinition>(
    `/api/v1/custom-field-definitions/${encodeURIComponent(id)}`,
  )

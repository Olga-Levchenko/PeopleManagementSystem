import axios from 'axios'
import { apiClient } from '@/api/client'

export type EmployeeFieldDataType = 'string' | 'number' | 'date' | 'boolean'

export interface EmployeeFieldCatalogEntry {
  key: string
  label: string
  kind: 'stored' | 'derived' | 'custom'
  dataType: EmployeeFieldDataType
  filterable: boolean
  columnable: boolean
}

export type EmployeeListAudienceLevel = 'colleague' | 'employee' | 'management'

export interface EmployeeFieldCatalogResponse {
  fields: EmployeeFieldCatalogEntry[]
  listAudienceLevel: EmployeeListAudienceLevel
}

export interface SavedViewFilters {
  countryCity?: string
  departmentId?: string
  yearsWithCompanyMin?: number
  yearsWithCompanyMax?: number
  customFieldFilters?: Record<string, string>
}

export interface SavedViewConfiguration {
  visibleColumnKeys: string[]
  filters: SavedViewFilters
}

export interface EmployeeSavedView {
  id: string
  name: string
  creatorPersonId: string
  isOwner: boolean
  pageSize: number
  configuration: SavedViewConfiguration
  applicableConfiguration: SavedViewConfiguration
}

export interface CreateSavedViewRequest {
  name: string
  pageSize: number
  configuration: SavedViewConfiguration
}

export interface UpdateSavedViewRequest {
  name?: string
  pageSize?: number
  configuration?: SavedViewConfiguration
}

export interface EmployeeListRow {
  personId: string
  values: Record<string, string | number | null>
  editableFields: string[]
}

export interface PatchEmployeeFieldRequest {
  fieldKey: string
  value: unknown
}

export interface PatchEmployeeFieldResponse {
  fieldKey: string
  value: string | number | boolean | null
}

export interface EmployeeListResponse {
  items: EmployeeListRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface ListEmployeesParams {
  page?: number
  pageSize?: number
  departmentId?: string
  countryCity?: string
  yearsWithCompanyMin?: number
  yearsWithCompanyMax?: number
  customFieldFilters?: Record<string, string>
}

export type EmployeesError =
  | 'validation'
  | 'unauthorized'
  | 'permission'
  | 'unavailable'
  | 'unknown'

export const getEmployeesError = (error: unknown): EmployeesError => {
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
    case 503:
      return 'unavailable'
    default:
      return 'unknown'
  }
}

export const getFieldCatalogApiCall = (signal?: AbortSignal) =>
  apiClient.get<EmployeeFieldCatalogResponse>('/api/v1/employees/field-catalog', {
    signal,
  })

export const patchEmployeeFieldApiCall = (
  subjectPersonId: string,
  body: PatchEmployeeFieldRequest,
) =>
  apiClient.patch<PatchEmployeeFieldResponse>(
    `/api/v1/employees/${subjectPersonId}/fields`,
    body,
  )

export const listSavedViewsApiCall = (signal?: AbortSignal) =>
  apiClient.get<EmployeeSavedView[]>('/api/v1/employees/saved-views', { signal })

export const createSavedViewApiCall = (body: CreateSavedViewRequest) =>
  apiClient.post<EmployeeSavedView>('/api/v1/employees/saved-views', body)

export const updateSavedViewApiCall = (viewId: string, body: UpdateSavedViewRequest) =>
  apiClient.patch<EmployeeSavedView>(`/api/v1/employees/saved-views/${viewId}`, body)

export const deleteSavedViewApiCall = (viewId: string) =>
  apiClient.delete(`/api/v1/employees/saved-views/${viewId}`)

export const listEmployeesApiCall = (params: ListEmployeesParams, signal?: AbortSignal) => {
  const { customFieldFilters, ...rest } = params
  return apiClient.get<EmployeeListResponse>('/api/v1/employees', {
    signal,
    params: {
      ...rest,
      ...customFieldFilters,
    },
  })
}

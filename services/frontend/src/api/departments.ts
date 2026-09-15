import { apiClient } from '@/api/client'

export interface DepartmentOption {
  id: string
  name: string | null
}

export const listDepartmentsApiCall = (name?: string, signal?: AbortSignal) =>
  apiClient.get<DepartmentOption[]>('/api/v1/departments', {
    signal,
    params: name ? { name } : undefined,
  })

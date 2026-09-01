import axios from 'axios'
import { apiClient } from '@/api/client'

export type RelationshipChangeError =
  | 'validation'
  | 'permission'
  | 'missing'
  | 'unavailable'
  | 'unknown'

export interface RelationshipChange {
  relatedPersonId?: string
}

export interface DepartmentChange {
  departmentId: string | null
}

export const getRelationshipChangeError = (error: unknown): RelationshipChangeError => {
  if (!axios.isAxiosError(error)) {
    return 'unknown'
  }

  switch (error.response?.status) {
    case 400:
      return 'validation'
    case 403:
      return 'permission'
    case 404:
      return 'missing'
    case 503:
      return 'unavailable'
    default:
      return 'unknown'
  }
}

export const changeManager = (personId: string, relatedPersonId?: string) =>
  apiClient.patch(`/api/v1/organisational-relationships/people/${personId}/manager`, {
    relatedPersonId,
  })

export const changePeoplePartner = (personId: string, relatedPersonId?: string) =>
  apiClient.patch(
    `/api/v1/organisational-relationships/people/${personId}/people-partner`,
    { relatedPersonId },
  )

export const changeDepartment = (personId: string, departmentId: string | null) =>
  apiClient.patch(`/api/v1/organisational-relationships/people/${personId}/department`, {
    departmentId,
  })

export const changeDepartmentManager = (departmentId: string, relatedPersonId?: string) =>
  apiClient.patch(`/api/v1/organisational-relationships/departments/${departmentId}/manager`, {
    relatedPersonId,
  })

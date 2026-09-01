import { apiClient } from '@/api/client'

export interface RelationshipChange {
  relatedPersonId?: string
}

export interface DepartmentChange {
  departmentId: string | null
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

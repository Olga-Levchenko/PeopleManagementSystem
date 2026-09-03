import axios from 'axios'
import { apiClient } from '@/api/client'

export interface Permission {
  permissionKey: string
  requiresScope: boolean
}

export interface FunctionalRole {
  id: string
  roleKey: string
  displayName: string
  isSeeded: boolean
  isActive: boolean
}

export interface FunctionalRolePermission {
  id: string
  roleKey: string
  permissionKey: string
  scope: string | null
}

export interface FunctionalRoleAssignment {
  id: string
  personId: string
  roleKey: string
  isActive: boolean
}

export interface PermissionCatalogueResponse {
  permissions: Permission[]
}

export interface FunctionalRoleListResponse {
  roles: FunctionalRole[]
}

export interface FunctionalRolePermissionListResponse {
  grants: FunctionalRolePermission[]
}

export interface FunctionalRoleAssignmentListResponse {
  assignments: FunctionalRoleAssignment[]
}

export type FunctionalRoleError =
  | 'validation'
  | 'unauthorized'
  | 'permission'
  | 'missing'
  | 'conflict'
  | 'unavailable'
  | 'unknown'

const idempotencyKey = () => crypto.randomUUID()

export const getFunctionalRoleError = (error: unknown): FunctionalRoleError => {
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

export const getPermissionCatalogue = (signal?: AbortSignal) =>
  apiClient.get<PermissionCatalogueResponse>(
    '/api/v1/permissions/catalogue',
    { signal },
  )

export const getFunctionalRoles = (signal?: AbortSignal) =>
  apiClient.get<FunctionalRoleListResponse>(
    '/api/v1/functional-roles',
    { signal },
  )

export const getFunctionalRole = (roleKey: string, signal?: AbortSignal) =>
  apiClient.get<FunctionalRole>(
    `/api/v1/functional-roles/${encodeURIComponent(roleKey)}`,
    { signal },
  )

const normalizeScope = (scope: unknown): string | null => {
  if (scope === null) {
    return null
  }
  if (typeof scope !== 'string') {
    throw new Error('Invalid permission scope.')
  }

  try {
    const parsed: unknown = JSON.parse(scope)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid permission scope.')
    }
    const values = parsed as Record<string, unknown>
    if (
      Object.keys(values).length !== 1 ||
      typeof values.dashboardType !== 'string'
    ) {
      throw new Error('Invalid permission scope.')
    }
    return JSON.stringify(parsed)
  } catch {
    throw new Error('Invalid permission scope.')
  }
}

export const getFunctionalRolePermissions = async (
  roleKey: string,
  signal?: AbortSignal,
): Promise<FunctionalRolePermissionListResponse> => {
  const response = await apiClient.get<FunctionalRolePermissionListResponse>(
    `/api/v1/functional-roles/${encodeURIComponent(roleKey)}/permissions`,
    { signal },
  )

  return {
    grants: response.grants.map(grant => ({
      ...grant,
      scope: normalizeScope(grant.scope),
    })),
  }
}

export const createFunctionalRole = (roleKey: string, displayName: string) =>
  apiClient.post<FunctionalRole>(
    '/api/v1/functional-roles',
    { roleKey, displayName },
    { headers: { 'Idempotency-Key': idempotencyKey() } }
  )

export const updateFunctionalRole = (roleKey: string, displayName: string) =>
  apiClient.patch<FunctionalRole>(`/api/v1/functional-roles/${encodeURIComponent(roleKey)}`, {
    displayName,
  })

export const deactivateFunctionalRole = (roleKey: string, reason: string) =>
  apiClient.post<FunctionalRole>(
    `/api/v1/functional-roles/${encodeURIComponent(roleKey)}/deactivate`,
    { reason }
  )

export const grantPermission = (
  roleKey: string,
  permissionKey: string,
  scope: Record<string, string> | null,
) =>
  apiClient.put<FunctionalRolePermission>(
    `/api/v1/functional-roles/${encodeURIComponent(roleKey)}/permissions/${encodeURIComponent(permissionKey)}`,
    { scope },
    { headers: { 'Idempotency-Key': idempotencyKey() } }
  )

export const revokePermission = (
  roleKey: string,
  permissionKey: string,
  scope: string | null,
) =>
  apiClient.delete<void>(
    `/api/v1/functional-roles/${encodeURIComponent(roleKey)}/permissions/${encodeURIComponent(permissionKey)}`,
    { params: scope ? { scope } : undefined },
  )

export const assignFunctionalRole = (personId: string, roleKey: string) =>
  apiClient.post<FunctionalRoleAssignment>(
    `/api/v1/people/${encodeURIComponent(personId)}/functional-roles`,
    { roleKey },
    { headers: { 'Idempotency-Key': idempotencyKey() } }
  )

export const revokeFunctionalRole = (personId: string, roleKey: string) =>
  apiClient.delete<void>(
    `/api/v1/people/${encodeURIComponent(personId)}/functional-roles/${encodeURIComponent(roleKey)}`
  )

export const getFunctionalRoleAssignments = (personId: string) =>
  apiClient.get<FunctionalRoleAssignmentListResponse>(
    `/api/v1/people/${encodeURIComponent(personId)}/functional-roles`
  )

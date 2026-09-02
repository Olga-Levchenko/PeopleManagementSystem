import { useCallback, useEffect, useState } from 'react'
import {
  assignFunctionalRole,
  createFunctionalRole,
  deactivateFunctionalRole,
  getFunctionalRole,
  getFunctionalRoleAssignments,
  getFunctionalRoleError,
  getFunctionalRolePermissions,
  getFunctionalRoles,
  getPermissionCatalogue,
  grantPermission,
  revokeFunctionalRole,
  revokePermission,
  updateFunctionalRole,
  type FunctionalRole,
  type FunctionalRoleAssignment,
  type FunctionalRoleError,
  type FunctionalRolePermission,
  type Permission,
} from '@/api/functionalRoles'

interface AsyncState {
  busy: boolean
  error: FunctionalRoleError | null
}

const initialAsyncState: AsyncState = { busy: false, error: null }

export const useFunctionalRoles = () => {
  const [roles, setRoles] = useState<FunctionalRole[]>([])
  const [catalogue, setCatalogue] = useState<Permission[]>([])
  const [selectedRole, setSelectedRole] = useState<FunctionalRole | null>(null)
  const [assignments, setAssignments] = useState<FunctionalRoleAssignment[]>([])
  const [grants, setGrants] = useState<FunctionalRolePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<FunctionalRoleError | null>(null)
  const [mutation, setMutation] = useState<AsyncState>(initialAsyncState)
  const [assignmentState, setAssignmentState] = useState<AsyncState>(initialAsyncState)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [roleResponse, catalogueResponse] = await Promise.all([
        getFunctionalRoles(),
        getPermissionCatalogue(),
      ])
      setRoles(roleResponse.roles)
      setCatalogue(catalogueResponse.permissions)
      setSelectedRole(current =>
        current
          ? (roleResponse.roles.find(role => role.roleKey === current.roleKey) ?? null)
          : (roleResponse.roles[0] ?? null)
      )
    } catch (error) {
      setLoadError(getFunctionalRoleError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const selectedRoleKey = selectedRole?.roleKey

  const loadRolePermissions = useCallback(async (roleKey: string) => {
    try {
      const result = await getFunctionalRolePermissions(roleKey)
      setGrants(result.grants)
    } catch (error) {
      setLoadError(getFunctionalRoleError(error))
    }
  }, [])

  useEffect(() => {
    if (!selectedRoleKey) {
      return
    }

    const refresh = window.setTimeout(() => {
      void getFunctionalRole(selectedRoleKey)
        .then(setSelectedRole)
        .catch(error => setLoadError(getFunctionalRoleError(error)))
      void loadRolePermissions(selectedRoleKey)
    }, 0)

    return () => window.clearTimeout(refresh)
  }, [loadRolePermissions, selectedRoleKey])

  const runMutation = async (operation: () => Promise<unknown>) => {
    setMutation({ busy: true, error: null })
    try {
      await operation()
      await load()
    } catch (error) {
      setMutation({ busy: false, error: getFunctionalRoleError(error) })
      return false
    }
    setMutation(initialAsyncState)
    return true
  }

  const runAssignmentMutation = async (operation: () => Promise<unknown>) => {
    setAssignmentState({ busy: true, error: null })
    try {
      await operation()
    } catch (error) {
      setAssignmentState({ busy: false, error: getFunctionalRoleError(error) })
      return false
    }
    setAssignmentState(initialAsyncState)
    return true
  }

  const createRole = (roleKey: string, displayName: string) =>
    runMutation(() => createFunctionalRole(roleKey, displayName))

  const updateRole = (roleKey: string, displayName: string) =>
    runMutation(() => updateFunctionalRole(roleKey, displayName))

  const deactivateRole = (roleKey: string, reason: string) =>
    runMutation(() => deactivateFunctionalRole(roleKey, reason))

  const grant = async (
    roleKey: string,
    permissionKey: string,
    scope: Record<string, string> | null
  ) => {
    const success = await runMutation(async () => {
      await grantPermission(roleKey, permissionKey, scope)
    })
    if (success) {
      await loadRolePermissions(roleKey)
    }
    return success
  }

  const revoke = async (
    roleKey: string,
    permissionKey: string,
    scope: string | null
  ) => {
    const success = await runMutation(() => revokePermission(roleKey, permissionKey, scope))
    if (success) {
      await loadRolePermissions(roleKey)
    }
    return success
  }

  const loadAssignments = async (personId: string) => {
    setAssignmentState({ busy: true, error: null })
    try {
      const result = await getFunctionalRoleAssignments(personId)
      setAssignments(result.assignments)
    } catch (error) {
      setAssignmentState({ busy: false, error: getFunctionalRoleError(error) })
      return false
    }
    setAssignmentState(initialAsyncState)
    return true
  }

  const assign = async (personId: string, roleKey: string) => {
    const success = await runAssignmentMutation(() => assignFunctionalRole(personId, roleKey))
    if (success) {
      await loadAssignments(personId)
    }
    return success
  }

  const revokeAssignment = async (personId: string, roleKey: string) => {
    const success = await runAssignmentMutation(() => revokeFunctionalRole(personId, roleKey))
    if (success) {
      await loadAssignments(personId)
    }
    return success
  }

  return {
    assignments,
    assign,
    assignmentState,
    catalogue,
    createRole,
    deactivateRole,
    grant,
    loadAssignments,
    loadError,
    loading,
    mutation,
    revoke,
    revokeAssignment,
    roles,
    selectedRole,
    selectRole: setSelectedRole,
    grants,
    updateRole,
  }
}

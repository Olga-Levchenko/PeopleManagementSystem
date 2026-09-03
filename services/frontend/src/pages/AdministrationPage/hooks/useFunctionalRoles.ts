import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [assignmentPersonId, setAssignmentPersonId] = useState<string | null>(null)
  const [grants, setGrants] = useState<FunctionalRolePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<FunctionalRoleError | null>(null)
  const [mutation, setMutation] = useState<AsyncState>(initialAsyncState)
  const [assignmentState, setAssignmentState] = useState<AsyncState>(initialAsyncState)
  const roleRequestVersion = useRef(0)
  const assignmentRequestVersion = useRef(0)
  const assignmentRequestController = useRef<AbortController | null>(null)
  const selectedRoleKeyRef = useRef<string | undefined>(undefined)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [roleResponse, catalogueResponse] = await Promise.all([
        getFunctionalRoles(signal),
        getPermissionCatalogue(signal),
      ])
      if (signal?.aborted) {
        return
      }
      setRoles(roleResponse.roles)
      setCatalogue(catalogueResponse.permissions)
      setSelectedRole(current =>
        current
          ? (roleResponse.roles.find(role => role.roleKey === current.roleKey) ?? null)
          : (roleResponse.roles[0] ?? null)
      )
    } catch (error) {
      if (signal?.aborted || axios.isCancel(error)) {
        return
      }
      setLoadError(getFunctionalRoleError(error))
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

  const selectedRoleKey = selectedRole?.roleKey
  const selectRole = useCallback((role: FunctionalRole) => {
    setLoadError(null)
    setSelectedRole(role)
  }, [])

  useEffect(() => {
    selectedRoleKeyRef.current = selectedRoleKey
  }, [selectedRoleKey])

  const loadRolePermissions = useCallback(async (roleKey: string) => {
    const requestVersion = ++roleRequestVersion.current
    try {
      const result = await getFunctionalRolePermissions(roleKey)
      if (
        requestVersion !== roleRequestVersion.current ||
        selectedRoleKeyRef.current !== roleKey
      ) {
        return
      }
      setGrants(result.grants)
    } catch (error) {
      if (
        axios.isCancel(error) ||
        requestVersion !== roleRequestVersion.current ||
        selectedRoleKeyRef.current !== roleKey
      ) {
        return
      }
      setLoadError(getFunctionalRoleError(error))
    }
  }, [])

  useEffect(() => {
    if (!selectedRoleKey) {
      return
    }

    const controller = new AbortController()
    const requestVersion = ++roleRequestVersion.current
    const roleKey = selectedRoleKey

    const loadSelectedRole = async () => {
      try {
        const [role, permissionResponse] = await Promise.all([
          getFunctionalRole(roleKey, controller.signal),
          getFunctionalRolePermissions(roleKey, controller.signal),
        ])
        if (
          controller.signal.aborted ||
          requestVersion !== roleRequestVersion.current ||
          selectedRoleKeyRef.current !== roleKey
        ) {
          return
        }
        setSelectedRole(role)
        setGrants(permissionResponse.grants)
      } catch (error) {
        if (
          controller.signal.aborted ||
          axios.isCancel(error) ||
          requestVersion !== roleRequestVersion.current ||
          selectedRoleKeyRef.current !== roleKey
        ) {
          return
        }
        setLoadError(getFunctionalRoleError(error))
      }
    }

    void loadSelectedRole()

    return () => controller.abort()
  }, [selectedRoleKey])

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

  const resetAssignments = useCallback(() => {
    assignmentRequestVersion.current += 1
    assignmentRequestController.current?.abort()
    assignmentRequestController.current = null
    setAssignments([])
    setAssignmentPersonId(null)
    setAssignmentState(initialAsyncState)
  }, [])

  const loadAssignments = useCallback(async (personId: string) => {
    const requestVersion = ++assignmentRequestVersion.current
    assignmentRequestController.current?.abort()
    const controller = new AbortController()
    assignmentRequestController.current = controller
    setAssignmentState({ busy: true, error: null })
    try {
      const result = await getFunctionalRoleAssignments(personId, controller.signal)
      if (
        controller.signal.aborted ||
        requestVersion !== assignmentRequestVersion.current
      ) {
        return false
      }
      setAssignments(result.assignments)
      setAssignmentPersonId(personId)
    } catch (error) {
      if (
        controller.signal.aborted ||
        requestVersion !== assignmentRequestVersion.current ||
        axios.isCancel(error)
      ) {
        return false
      }
      setAssignmentState({ busy: false, error: getFunctionalRoleError(error) })
      return false
    } finally {
      if (
        !controller.signal.aborted &&
        requestVersion === assignmentRequestVersion.current
      ) {
        assignmentRequestController.current = null
      }
    }
    setAssignmentState(initialAsyncState)
    return true
  }, [])

  const assign = async (personId: string, roleKey: string) => {
    const success = await runAssignmentMutation(() => assignFunctionalRole(personId, roleKey))
    if (success) {
      await loadAssignments(personId)
    }
    return success
  }

  const revokeAssignment = async (personId: string, roleKey: string) => {
    if (assignmentPersonId !== personId) {
      return false
    }
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
    assignmentPersonId,
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
    resetAssignments,
    roles,
    selectedRole,
    selectRole,
    grants,
    updateRole,
  }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  appendProfileRiskApiCall,
  getEmployeeProfileApiCall,
  getProfileRisksApiCall,
  type AppendProfileRiskRequest,
} from '@/api/profile'

export const employeeProfileQueryKey = (personId: string | undefined) =>
  ['people', 'profile', personId] as const

export const profileRisksQueryKey = (personId: string | undefined) =>
  ['people', 'profile', personId, 'risks'] as const

export const useEmployeeProfile = (personId: string | undefined) =>
  useQuery({
    queryKey: employeeProfileQueryKey(personId),
    queryFn: ({ signal }) => {
      if (!personId) {
        throw new Error('personId is required')
      }
      return getEmployeeProfileApiCall(personId, signal)
    },
    enabled: Boolean(personId),
  })

export const useProfileRisks = (
  personId: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: profileRisksQueryKey(personId),
    queryFn: ({ signal }) => {
      if (!personId) {
        throw new Error('personId is required')
      }
      return getProfileRisksApiCall(personId, signal)
    },
    enabled: Boolean(personId) && enabled,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } }).response?.status
      return status === 403 ? false : failureCount < 2
    },
  })

export const useAppendProfileRisk = (personId: string | undefined) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AppendProfileRiskRequest) => {
      if (!personId) {
        throw new Error('personId is required')
      }
      return appendProfileRiskApiCall(personId, body)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeProfileQueryKey(personId) }),
        queryClient.invalidateQueries({ queryKey: profileRisksQueryKey(personId) }),
      ])
    },
  })
}

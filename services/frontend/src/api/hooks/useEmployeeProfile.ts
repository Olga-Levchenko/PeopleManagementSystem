import { useQuery } from '@tanstack/react-query'
import { getEmployeeProfileApiCall } from '@/api/profile'

export const employeeProfileQueryKey = (personId: string | undefined) =>
  ['people', 'profile', personId] as const

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

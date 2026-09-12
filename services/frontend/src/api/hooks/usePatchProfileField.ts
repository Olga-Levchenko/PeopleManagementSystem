import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  patchProfileFieldApiCall,
  type PatchProfileFieldRequest,
} from '@/api/profile'
import { employeeProfileQueryKey } from '@/api/hooks/useEmployeeProfile'

export const usePatchProfileField = (personId: string | undefined) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: PatchProfileFieldRequest) => {
      if (!personId) {
        throw new Error('personId is required')
      }
      return patchProfileFieldApiCall(personId, body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: employeeProfileQueryKey(personId),
      })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getFieldCatalogApiCall,
  listEmployeesApiCall,
  patchEmployeeFieldApiCall,
  type ListEmployeesParams,
  type PatchEmployeeFieldRequest,
} from '@/api/employees'

export const useEmployeeFieldCatalog = () =>
  useQuery({
    queryKey: ['employees', 'field-catalog'],
    queryFn: ({ signal }) => getFieldCatalogApiCall(signal),
  })

export const useEmployeesList = (params: ListEmployeesParams) =>
  useQuery({
    queryKey: ['employees', 'list', params],
    queryFn: ({ signal }) => listEmployeesApiCall(params, signal),
  })

export const usePatchEmployeeField = (listParams: ListEmployeesParams) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      subjectPersonId,
      body,
    }: {
      subjectPersonId: string
      body: PatchEmployeeFieldRequest
    }) => patchEmployeeFieldApiCall(subjectPersonId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees', 'list', listParams] })
    },
  })
}

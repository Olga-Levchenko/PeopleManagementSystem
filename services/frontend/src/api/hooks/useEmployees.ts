import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSavedViewApiCall,
  getFieldCatalogApiCall,
  listEmployeesApiCall,
  listSavedViewsApiCall,
  patchEmployeeFieldApiCall,
  updateSavedViewApiCall,
  type CreateSavedViewRequest,
  type ListEmployeesParams,
  type PatchEmployeeFieldRequest,
  type UpdateSavedViewRequest,
} from '@/api/employees'

export const useEmployeeFieldCatalog = () =>
  useQuery({
    queryKey: ['employees', 'field-catalog'],
    queryFn: ({ signal }) => getFieldCatalogApiCall(signal),
  })

export const useSavedViews = (enabled = true) =>
  useQuery({
    queryKey: ['employees', 'saved-views'],
    queryFn: ({ signal }) => listSavedViewsApiCall(signal),
    enabled,
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

export const useCreateSavedView = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateSavedViewRequest) => createSavedViewApiCall(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees', 'saved-views'] })
    },
  })
}

export const useUpdateSavedView = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      viewId,
      body,
    }: {
      viewId: string
      body: UpdateSavedViewRequest
    }) => updateSavedViewApiCall(viewId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees', 'saved-views'] })
    },
  })
}

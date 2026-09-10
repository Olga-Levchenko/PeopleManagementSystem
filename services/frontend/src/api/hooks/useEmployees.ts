import { useQuery } from '@tanstack/react-query'
import {
  getFieldCatalogApiCall,
  listEmployeesApiCall,
  type ListEmployeesParams,
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

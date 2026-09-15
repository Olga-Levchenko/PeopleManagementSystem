import { useQuery } from '@tanstack/react-query'
import { listDepartmentsApiCall } from '@/api/departments'

export const useDepartmentSearch = (query: string) =>
  useQuery({
    queryKey: ['departments', 'search', query],
    queryFn: ({ signal }) => listDepartmentsApiCall(query, signal),
    enabled: query.length >= 2,
    staleTime: 60_000,
  })

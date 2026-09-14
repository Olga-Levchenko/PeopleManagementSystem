import { useQuery } from '@tanstack/react-query'
import { getUMDashboardApiCall } from '@/api/umDashboard'

export const useUMDashboard = () =>
  useQuery({
    queryKey: ['um-dashboard'],
    queryFn: ({ signal }) => getUMDashboardApiCall(undefined, signal),
  })

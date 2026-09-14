import { useQuery } from '@tanstack/react-query'
import { getPPDashboardApiCall } from '@/api/ppDashboard'

export const usePPDashboard = () =>
  useQuery({
    queryKey: ['pp-dashboard'],
    queryFn: ({ signal }) => getPPDashboardApiCall(signal),
  })

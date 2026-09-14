import { useQuery } from '@tanstack/react-query'
import { getDMPMDashboardApiCall } from '@/api/dmPmDashboard'

export const useDMPMDashboard = () =>
  useQuery({
    queryKey: ['dm-pm-dashboard'],
    queryFn: ({ signal }) => getDMPMDashboardApiCall(signal),
  })

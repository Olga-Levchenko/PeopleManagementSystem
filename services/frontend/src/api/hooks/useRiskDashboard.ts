import { useQuery } from '@tanstack/react-query'
import { getRiskDashboardApiCall, type RiskDashboardParams } from '@/api/riskDashboard'

export const useRiskDashboard = (params: RiskDashboardParams) =>
  useQuery({
    queryKey: ['risk-dashboard', params],
    queryFn: ({ signal }) => getRiskDashboardApiCall(params, signal),
  })

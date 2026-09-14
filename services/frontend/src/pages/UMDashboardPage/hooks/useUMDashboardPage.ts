import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useUMDashboard } from '@/api/hooks/useUMDashboard'

interface UseUMDashboardPageResult {
  data: ReturnType<typeof useUMDashboard>['data']
  isLoading: boolean
  isError: boolean
  isUnauthorized: boolean
  navigateToProfile: (personId: string) => void
}

export const useUMDashboardPage = (): UseUMDashboardPageResult => {
  const navigate = useNavigate()
  const dashboard = useUMDashboard()

  const isUnauthorized =
    axios.isAxiosError(dashboard.error) && dashboard.error.response?.status === 403

  const navigateToProfile = (personId: string) => {
    navigate(`/people/${personId}`)
  }

  return {
    data: dashboard.data,
    isLoading: dashboard.isLoading,
    isError: dashboard.isError && !isUnauthorized,
    isUnauthorized,
    navigateToProfile,
  }
}

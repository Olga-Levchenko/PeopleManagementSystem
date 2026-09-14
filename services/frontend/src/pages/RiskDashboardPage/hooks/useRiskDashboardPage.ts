import axios from 'axios'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type RiskSeverity } from '@/api/riskDashboard'
import { useRiskDashboard } from '@/api/hooks/useRiskDashboard'

interface RiskDashboardFilters {
  severity: RiskSeverity | undefined
  departmentId: string | undefined
  projectId: string | undefined
  peoplePartnerId: string | undefined
  managerId: string | undefined
}

interface UseRiskDashboardPageResult {
  filters: RiskDashboardFilters
  setFilter: (value: string, setter: (next: string | undefined) => void) => void
  setSeverity: (level: RiskSeverity | undefined) => void
  setDepartmentId: (id: string | undefined) => void
  setProjectId: (id: string | undefined) => void
  setPeoplePartnerId: (id: string | undefined) => void
  setManagerId: (id: string | undefined) => void
  isUnauthorized: boolean
  navigateToProfile: (personId: string) => void
  isLoading: boolean
  isError: boolean
  data: ReturnType<typeof useRiskDashboard>['data']
}

export const useRiskDashboardPage = (): UseRiskDashboardPageResult => {
  const navigate = useNavigate()
  const [severity, setSeverity] = useState<RiskSeverity | undefined>()
  const [departmentId, setDepartmentId] = useState<string | undefined>()
  const [projectId, setProjectId] = useState<string | undefined>()
  const [peoplePartnerId, setPeoplePartnerId] = useState<string | undefined>()
  const [managerId, setManagerId] = useState<string | undefined>()

  const dashboard = useRiskDashboard({
    severity,
    departmentId,
    projectId,
    peoplePartnerId,
    managerId,
  })

  const isUnauthorized =
    axios.isAxiosError(dashboard.error) && dashboard.error.response?.status === 403

  const setFilter = (value: string, setter: (next: string | undefined) => void) => {
    setter(value || undefined)
  }

  const navigateToProfile = (personId: string) => {
    navigate(`/people/${personId}`)
  }

  return {
    filters: { severity, departmentId, projectId, peoplePartnerId, managerId },
    setFilter,
    setSeverity,
    setDepartmentId,
    setProjectId,
    setPeoplePartnerId,
    setManagerId,
    isUnauthorized,
    navigateToProfile,
    isLoading: dashboard.isLoading,
    isError: dashboard.isError,
    data: dashboard.data,
  }
}

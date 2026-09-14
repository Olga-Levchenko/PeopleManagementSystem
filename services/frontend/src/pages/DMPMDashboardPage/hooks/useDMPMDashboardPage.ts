import { useState, useMemo } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useDMPMDashboard } from '@/api/hooks/useDMPMDashboard'
import type {
  DMPMDashboardProject,
  DMPMDashboardRiskCounts,
  DMPMDashboardResponse,
} from '@/api/dmPmDashboard'

interface UseDMPMDashboardPageResult {
  data: DMPMDashboardResponse | undefined
  isLoading: boolean
  isError: boolean
  isUnauthorized: boolean
  navigateToProfile: (personId: string) => void
  selectedProjectId: string | 'all'
  setSelectedProjectId: (id: string | 'all') => void
  activeProjects: DMPMDashboardProject[]
  activeRiskCounts: DMPMDashboardRiskCounts
  activeTotalPeople: number
}

const EMPTY_RISK_COUNTS: DMPMDashboardRiskCounts = {
  low: 0,
  need_attention: 0,
  medium: 0,
  high: 0,
  leaver: 0,
}

export const useDMPMDashboardPage = (): UseDMPMDashboardPageResult => {
  const navigate = useNavigate()
  const dashboard = useDMPMDashboard()
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all')

  const isUnauthorized =
    axios.isAxiosError(dashboard.error) && dashboard.error.response?.status === 403

  const navigateToProfile = (personId: string) => {
    navigate(`/people/${personId}`)
  }

  // Client-side filtering — no refetch per selection
  const activeProjects = useMemo<DMPMDashboardProject[]>(() => {
    const projects = dashboard.data?.projects ?? []
    if (selectedProjectId === 'all') {
      return projects
    }
    return projects.filter((p) => p.projectId === selectedProjectId)
  }, [dashboard.data?.projects, selectedProjectId])

  const activeRiskCounts = useMemo<DMPMDashboardRiskCounts>(() => {
    if (!dashboard.data) return EMPTY_RISK_COUNTS
    if (selectedProjectId === 'all') return dashboard.data.riskCounts

    // Recompute counts for the selected project only
    const counts: DMPMDashboardRiskCounts = { ...EMPTY_RISK_COUNTS }
    const project = dashboard.data.projects.find(
      (p) => p.projectId === selectedProjectId,
    )
    if (!project) return counts
    for (const row of project.rows) {
      if (row.severity && row.severity in counts) {
        counts[row.severity] += 1
      }
    }
    return counts
  }, [dashboard.data, selectedProjectId])

  const activeTotalPeople = useMemo<number>(() => {
    if (selectedProjectId === 'all') {
      return dashboard.data?.totalPeople ?? 0
    }
    const project = dashboard.data?.projects.find(
      (p) => p.projectId === selectedProjectId,
    )
    return project?.rows.length ?? 0
  }, [dashboard.data, selectedProjectId])

  return {
    data: dashboard.data,
    isLoading: dashboard.isLoading,
    isError: dashboard.isError && !isUnauthorized,
    isUnauthorized,
    navigateToProfile,
    selectedProjectId,
    setSelectedProjectId,
    activeProjects,
    activeRiskCounts,
    activeTotalPeople,
  }
}

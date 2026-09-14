import { useState, useMemo } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { usePPDashboard } from '@/api/hooks/usePPDashboard'
import type { PPDashboardRow, PPDashboardRiskCounts } from '@/api/ppDashboard'

export type GroupBy = 'department' | 'project'

export interface GroupedRows {
  label: string
  rows: PPDashboardRow[]
}

interface UsePPDashboardPageResult {
  data: ReturnType<typeof usePPDashboard>['data']
  isLoading: boolean
  isError: boolean
  isUnauthorized: boolean
  navigateToProfile: (personId: string) => void
  groupBy: GroupBy
  setGroupBy: (groupBy: GroupBy) => void
  groupedRows: GroupedRows[]
  headcount: number
  riskCounts: PPDashboardRiskCounts
  actionItemCounts: { open: number; overdue: number }
}

const EMPTY_RISK_COUNTS: PPDashboardRiskCounts = {
  low: 0,
  need_attention: 0,
  medium: 0,
  high: 0,
  leaver: 0,
}

export const usePPDashboardPage = (): UsePPDashboardPageResult => {
  const navigate = useNavigate()
  const dashboard = usePPDashboard()
  const [groupBy, setGroupBy] = useState<GroupBy>('department')

  const isUnauthorized =
    axios.isAxiosError(dashboard.error) && dashboard.error.response?.status === 403

  const navigateToProfile = (personId: string) => {
    navigate(`/people/${personId}`)
  }

  // Counter card values derived from the full data — unchanged by grouping toggle
  const headcount = dashboard.data?.headcount ?? 0

  const riskCounts = useMemo<PPDashboardRiskCounts>(() => {
    if (!dashboard.data) return EMPTY_RISK_COUNTS
    return dashboard.data.riskCounts
  }, [dashboard.data])

  const actionItemCounts = useMemo(
    () => dashboard.data?.actionItemCounts ?? { open: 0, overdue: 0 },
    [dashboard.data],
  )

  // Client-side grouping — no refetch on toggle
  const groupedRows = useMemo<GroupedRows[]>(() => {
    const rows = dashboard.data?.rows ?? []
    if (groupBy === 'department') {
      const map = new Map<string, PPDashboardRow[]>()
      for (const row of rows) {
        const label = row.department?.label ?? 'No department'
        if (!map.has(label)) map.set(label, [])
        map.get(label)!.push(row)
      }
      return Array.from(map.entries()).map(([label, groupRows]) => ({
        label,
        rows: groupRows,
      }))
    }

    // Project grouping — a person can appear in multiple groups
    const map = new Map<string, PPDashboardRow[]>()
    for (const row of rows) {
      const projects = row.projects.length ? row.projects : ['Unassigned']
      for (const p of projects) {
        if (!map.has(p)) map.set(p, [])
        map.get(p)!.push(row)
      }
    }
    return Array.from(map.entries()).map(([label, groupRows]) => ({
      label,
      rows: groupRows,
    }))
  }, [dashboard.data?.rows, groupBy])

  return {
    data: dashboard.data,
    isLoading: dashboard.isLoading,
    isError: dashboard.isError && !isUnauthorized,
    isUnauthorized,
    navigateToProfile,
    groupBy,
    setGroupBy,
    groupedRows,
    headcount,
    riskCounts,
    actionItemCounts,
  }
}

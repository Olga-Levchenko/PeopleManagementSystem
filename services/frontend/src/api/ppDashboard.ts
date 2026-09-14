import { apiClient } from '@/api/client'
import { type RiskSeverity, type RiskTrendDirection } from '@/api/riskDashboard'

export interface PPDashboardRow {
  personId: string
  fullName: string
  department: { id: string; label: string } | null
  projects: string[]
  leaveStatus: string | null
  severity: RiskSeverity | null
  trendDirection: RiskTrendDirection | 'none'
}

export interface PPDashboardOwnActionItem {
  id: string
  title: string
  dueDate: string
  status: string
  isOverdue: boolean
}

export interface PPDashboardRiskCounts {
  low: number
  need_attention: number
  medium: number
  high: number
  leaver: number
}

export interface PPDashboardActionItemCounts {
  open: number
  overdue: number
}

export interface PPDashboardResponse {
  headcount: number
  riskCounts: PPDashboardRiskCounts
  actionItemCounts: PPDashboardActionItemCounts
  rows: PPDashboardRow[]
  ownActionItems: PPDashboardOwnActionItem[]
}

export const getPPDashboardApiCall = (signal?: AbortSignal) =>
  apiClient.get<PPDashboardResponse>('/api/v1/pp-dashboard', { signal })

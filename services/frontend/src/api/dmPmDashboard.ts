import { apiClient } from '@/api/client'
import { type RiskSeverity, type RiskTrendDirection } from '@/api/riskDashboard'

export interface DMPMDashboardRow {
  personId: string
  fullName: string
  severity: RiskSeverity | null
  trendDirection: RiskTrendDirection | 'none'
  leaveStatus: string | null
}

export interface DMPMDashboardProject {
  projectId: string
  projectLabel: string
  rows: DMPMDashboardRow[]
}

export interface DMPMDashboardOwnActionItem {
  id: string
  title: string
  dueDate: string
  status: string
  isOverdue: boolean
}

export interface DMPMDashboardRiskCounts {
  low: number
  need_attention: number
  medium: number
  high: number
  leaver: number
}

export interface DMPMDashboardActionItemCounts {
  open: number
  overdue: number
}

export interface DMPMDashboardResponse {
  totalPeople: number
  riskCounts: DMPMDashboardRiskCounts
  actionItemCounts: DMPMDashboardActionItemCounts
  projects: DMPMDashboardProject[]
  ownActionItems: DMPMDashboardOwnActionItem[]
}

export const getDMPMDashboardApiCall = (signal?: AbortSignal) =>
  apiClient.get<DMPMDashboardResponse>('/api/v1/dm-pm-dashboard', { signal })

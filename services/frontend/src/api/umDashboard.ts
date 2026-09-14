import { apiClient } from '@/api/client'

export interface UMDashboardRow {
  personId: string
  fullName: string
  department: { id: string; label: string } | null
  projects: Array<{ id: string; label: string }>
  leaveStatus: string | null
  severity: string | null
  trendDirection: string
  recordedAt: string | null
}

export interface UMDashboardOwnActionItem {
  id: string
  title: string
  dueDate: string
  status: string
  isOverdue: boolean
}

export interface UMDashboardRiskCounts {
  low: number
  need_attention: number
  medium: number
  high: number
  leaver: number
}

export interface UMDashboardActionItemCounts {
  open: number
  overdue: number
}

export interface UMDashboardResponse {
  headcount: number
  riskCounts: UMDashboardRiskCounts
  actionItemCounts: UMDashboardActionItemCounts
  rows: UMDashboardRow[]
  ownActionItems: UMDashboardOwnActionItem[]
}

export interface UMDashboardParams {
  pageSize?: number
}

export const getUMDashboardApiCall = (
  params?: UMDashboardParams,
  signal?: AbortSignal,
) =>
  apiClient.get<UMDashboardResponse>('/api/v1/um-dashboard', {
    params,
    signal,
  })

import { apiClient } from '@/api/client'

export type RiskSeverity = 'low' | 'need_attention' | 'medium' | 'high' | 'leaver'
export type RiskTrendDirection = 'up' | 'down' | null

export interface RiskDashboardOption {
  id: string
  label: string
}

export interface RiskDashboardCounts {
  low: number
  need_attention: number
  medium: number
  high: number
  leaver: number
  activeCount: number
}

export interface RiskDashboardRow {
  personId: string
  fullName: string
  severity: RiskSeverity
  recordedAt: string
  trendDirection: RiskTrendDirection
  department?: RiskDashboardOption | null
  projects?: RiskDashboardOption[]
  manager?: RiskDashboardOption | null
  peoplePartner?: RiskDashboardOption | null
}

export interface RiskDashboardResponse {
  counts: RiskDashboardCounts
  rows: RiskDashboardRow[]
  nextCursor: string | null
  catalogs: {
    departments: RiskDashboardOption[]
    projects: RiskDashboardOption[]
    peoplePartners: RiskDashboardOption[]
    managers: RiskDashboardOption[]
  }
}

export interface RiskDashboardParams {
  severity?: RiskSeverity
  departmentId?: string
  projectId?: string
  peoplePartnerId?: string
  managerId?: string
  pageSize?: number
  cursor?: string
}

export const getRiskDashboardApiCall = (params: RiskDashboardParams, signal?: AbortSignal) =>
  apiClient.get<RiskDashboardResponse>('/api/v1/risk-dashboard', { params, signal })

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/hooks/useDMPMDashboard', () => ({
  useDMPMDashboard: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

import { useDMPMDashboard } from '@/api/hooks/useDMPMDashboard'
import { useDMPMDashboardPage } from '../hooks/useDMPMDashboardPage'

const mockUseDMPMDashboard = vi.mocked(useDMPMDashboard)

const twoProjectData = {
  totalPeople: 3,
  riskCounts: { low: 1, need_attention: 0, medium: 1, high: 1, leaver: 0 },
  actionItemCounts: { open: 2, overdue: 1 },
  projects: [
    {
      projectId: 'project-alpha',
      projectLabel: 'Alpha',
      rows: [
        { personId: 'p1', fullName: 'Alice', severity: 'high' as const, trendDirection: 'up' as const, leaveStatus: null },
        { personId: 'p2', fullName: 'Bob', severity: 'medium' as const, trendDirection: 'none' as const, leaveStatus: null },
      ],
    },
    {
      projectId: 'project-beta',
      projectLabel: 'Beta',
      rows: [
        { personId: 'p3', fullName: 'Carol', severity: 'low' as const, trendDirection: 'down' as const, leaveStatus: 'Annual' },
      ],
    },
  ],
  ownActionItems: [],
}

describe('useDMPMDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDMPMDashboard.mockReturnValue({
      data: twoProjectData,
      isLoading: false,
      isError: false,
      error: null,
    } as never)
  })

  it('defaults to all projects and returns global aggregates', () => {
    const { result } = renderHook(() => useDMPMDashboardPage())

    expect(result.current.selectedProjectId).toBe('all')
    expect(result.current.activeProjects).toHaveLength(2)
    expect(result.current.activeTotalPeople).toBe(3)
    expect(result.current.activeRiskCounts.high).toBe(1)
    expect(result.current.activeRiskCounts.medium).toBe(1)
    expect(result.current.activeRiskCounts.low).toBe(1)
  })

  it('filters activeProjects and recomputes counts when a project is selected', async () => {
    const { result } = renderHook(() => useDMPMDashboardPage())

    act(() => {
      result.current.setSelectedProjectId('project-alpha')
    })

    await waitFor(() => {
      expect(result.current.selectedProjectId).toBe('project-alpha')
    })

    expect(result.current.activeProjects).toHaveLength(1)
    expect(result.current.activeProjects[0].projectId).toBe('project-alpha')
    expect(result.current.activeTotalPeople).toBe(2) // alpha has 2 rows
    expect(result.current.activeRiskCounts.high).toBe(1)
    expect(result.current.activeRiskCounts.medium).toBe(1)
    expect(result.current.activeRiskCounts.low).toBe(0) // low is in beta only
  })

  it('returns empty activeProjects and zero counts for an unmatched project id', () => {
    const { result } = renderHook(() => useDMPMDashboardPage())

    act(() => {
      result.current.setSelectedProjectId('project-nonexistent')
    })

    expect(result.current.activeProjects).toHaveLength(0)
    expect(result.current.activeTotalPeople).toBe(0)
    expect(result.current.activeRiskCounts).toEqual({
      low: 0,
      need_attention: 0,
      medium: 0,
      high: 0,
      leaver: 0,
    })
  })

  it('marks isUnauthorized true and isError false on 403 response', () => {
    const axiosError = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403 },
    })
    mockUseDMPMDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: axiosError,
    } as never)

    const { result } = renderHook(() => useDMPMDashboardPage())

    expect(result.current.isUnauthorized).toBe(true)
    expect(result.current.isError).toBe(false)
  })

  it('marks isError true and isUnauthorized false on non-403 error', () => {
    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      response: { status: 500 },
    })
    mockUseDMPMDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: networkError,
    } as never)

    const { result } = renderHook(() => useDMPMDashboardPage())

    expect(result.current.isUnauthorized).toBe(false)
    expect(result.current.isError).toBe(true)
  })
})

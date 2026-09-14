import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/hooks/usePPDashboard', () => ({
  usePPDashboard: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

import { usePPDashboard } from '@/api/hooks/usePPDashboard'
import { usePPDashboardPage } from '../hooks/usePPDashboardPage'

const mockUsePPDashboard = vi.mocked(usePPDashboard)

const twoPersonData = {
  headcount: 3,
  riskCounts: { low: 1, need_attention: 0, medium: 1, high: 1, leaver: 0 },
  actionItemCounts: { open: 2, overdue: 1 },
  rows: [
    {
      personId: 'p1',
      fullName: 'Alice',
      department: { id: 'dept-1', label: 'Engineering' },
      projects: ['Alpha', 'Beta'],
      severity: 'high' as const,
      trendDirection: 'up' as const,
      leaveStatus: null,
    },
    {
      personId: 'p2',
      fullName: 'Bob',
      department: { id: 'dept-1', label: 'Engineering' },
      projects: [],
      severity: 'medium' as const,
      trendDirection: 'none' as const,
      leaveStatus: null,
    },
    {
      personId: 'p3',
      fullName: 'Carol',
      department: { id: 'dept-2', label: 'Design' },
      projects: ['Beta'],
      severity: 'low' as const,
      trendDirection: 'down' as const,
      leaveStatus: 'Annual',
    },
  ],
  ownActionItems: [],
}

describe('usePPDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePPDashboard.mockReturnValue({
      data: twoPersonData,
      isLoading: false,
      isError: false,
      error: null,
    } as never)
  })

  it('defaults to department grouping and groups rows correctly', () => {
    const { result } = renderHook(() => usePPDashboardPage())

    expect(result.current.groupBy).toBe('department')
    expect(result.current.groupedRows).toHaveLength(2)

    const engGroup = result.current.groupedRows.find(
      (g) => g.label === 'Engineering',
    )
    const designGroup = result.current.groupedRows.find(
      (g) => g.label === 'Design',
    )
    expect(engGroup?.rows).toHaveLength(2)
    expect(designGroup?.rows).toHaveLength(1)
  })

  it('counter cards reflect global counts regardless of groupBy', () => {
    const { result } = renderHook(() => usePPDashboardPage())

    expect(result.current.headcount).toBe(3)
    expect(result.current.riskCounts.high).toBe(1)
    expect(result.current.riskCounts.medium).toBe(1)
    expect(result.current.riskCounts.low).toBe(1)
    expect(result.current.actionItemCounts.open).toBe(2)
    expect(result.current.actionItemCounts.overdue).toBe(1)
  })

  it('project grouping allows a person on multiple projects to appear in each group', async () => {
    const { result } = renderHook(() => usePPDashboardPage())

    act(() => {
      result.current.setGroupBy('project')
    })

    await waitFor(() => {
      expect(result.current.groupBy).toBe('project')
    })

    const alphaGroup = result.current.groupedRows.find(
      (g) => g.label === 'Alpha',
    )
    const betaGroup = result.current.groupedRows.find(
      (g) => g.label === 'Beta',
    )

    // Alpha has p1 only; Beta has both p1 and p3
    expect(alphaGroup?.rows).toHaveLength(1)
    expect(alphaGroup?.rows[0].personId).toBe('p1')
    expect(betaGroup?.rows).toHaveLength(2)
    const betaPersonIds = betaGroup?.rows.map((r) => r.personId)
    expect(betaPersonIds).toContain('p1')
    expect(betaPersonIds).toContain('p3')
  })

  it('person with no projects appears in Unassigned group when grouping by project', async () => {
    const { result } = renderHook(() => usePPDashboardPage())

    act(() => {
      result.current.setGroupBy('project')
    })

    await waitFor(() => {
      expect(result.current.groupBy).toBe('project')
    })

    const unassignedGroup = result.current.groupedRows.find(
      (g) => g.label === 'Unassigned',
    )
    expect(unassignedGroup?.rows).toHaveLength(1)
    expect(unassignedGroup?.rows[0].personId).toBe('p2')
  })

  it('counter card values do not change when groupBy toggle switches', async () => {
    const { result } = renderHook(() => usePPDashboardPage())

    const initialHeadcount = result.current.headcount
    const initialRiskCounts = { ...result.current.riskCounts }

    act(() => {
      result.current.setGroupBy('project')
    })

    await waitFor(() => {
      expect(result.current.groupBy).toBe('project')
    })

    expect(result.current.headcount).toBe(initialHeadcount)
    expect(result.current.riskCounts).toEqual(initialRiskCounts)
  })

  it('marks isUnauthorized true and isError false on 403 response', () => {
    const axiosError = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403 },
    })
    mockUsePPDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: axiosError,
    } as never)

    const { result } = renderHook(() => usePPDashboardPage())

    expect(result.current.isUnauthorized).toBe(true)
    expect(result.current.isError).toBe(false)
  })

  it('marks isError true and isUnauthorized false on non-403 error', () => {
    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      response: { status: 500 },
    })
    mockUsePPDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: networkError,
    } as never)

    const { result } = renderHook(() => usePPDashboardPage())

    expect(result.current.isUnauthorized).toBe(false)
    expect(result.current.isError).toBe(true)
  })

  it('groups person with null department into No department group', () => {
    mockUsePPDashboard.mockReturnValue({
      data: {
        ...twoPersonData,
        rows: [
          {
            personId: 'p4',
            fullName: 'Dana',
            department: null,
            projects: [],
            severity: null,
            trendDirection: 'none' as const,
            leaveStatus: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never)

    const { result } = renderHook(() => usePPDashboardPage())

    const noDeptGroup = result.current.groupedRows.find(
      (g) => g.label === 'No department',
    )
    expect(noDeptGroup?.rows).toHaveLength(1)
    expect(noDeptGroup?.rows[0].personId).toBe('p4')
  })
})

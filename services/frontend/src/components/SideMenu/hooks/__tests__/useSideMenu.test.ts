import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSideMenu } from '../useSideMenu'

vi.mock('@/api/functionalRoles', () => ({
  getFunctionalRoles: vi.fn(),
}))

vi.mock('@/api/riskDashboard', () => ({
  getRiskDashboardApiCall: vi.fn(),
}))

import { getFunctionalRoles } from '@/api/functionalRoles'
import { getRiskDashboardApiCall } from '@/api/riskDashboard'

const mockGetFunctionalRoles = vi.mocked(getFunctionalRoles)
const mockGetRiskDashboardApiCall = vi.mocked(getRiskDashboardApiCall)

describe('useSideMenu', () => {
  it('sets both flags to true when both probes resolve', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(true)
      expect(result.current.canAccessRiskDashboard).toBe(true)
    })
  })

  it('sets both flags to false when both probes reject', async () => {
    mockGetFunctionalRoles.mockRejectedValue(new Error('Forbidden'))
    mockGetRiskDashboardApiCall.mockRejectedValue(new Error('Forbidden'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(false)
      expect(result.current.canAccessRiskDashboard).toBe(false)
    })
  })
})

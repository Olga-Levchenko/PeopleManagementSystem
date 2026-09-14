import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSideMenu } from '../useSideMenu'

vi.mock('@/api/functionalRoles', () => ({
  getFunctionalRoles: vi.fn(),
}))

vi.mock('@/api/riskDashboard', () => ({
  getRiskDashboardApiCall: vi.fn(),
}))

vi.mock('@/api/umDashboard', () => ({
  getUMDashboardApiCall: vi.fn(),
}))

import { getFunctionalRoles } from '@/api/functionalRoles'
import { getRiskDashboardApiCall } from '@/api/riskDashboard'
import { getUMDashboardApiCall } from '@/api/umDashboard'

const mockGetFunctionalRoles = vi.mocked(getFunctionalRoles)
const mockGetRiskDashboardApiCall = vi.mocked(getRiskDashboardApiCall)
const mockGetUMDashboardApiCall = vi.mocked(getUMDashboardApiCall)

describe('useSideMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets all flags to true when all probes resolve', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)
    mockGetUMDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(true)
      expect(result.current.canAccessRiskDashboard).toBe(true)
      expect(result.current.canAccessUMDashboard).toBe(true)
    })
  })

  it('sets all flags to false when all probes reject', async () => {
    mockGetFunctionalRoles.mockRejectedValue(new Error('Forbidden'))
    mockGetRiskDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetUMDashboardApiCall.mockRejectedValue(new Error('Forbidden'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(false)
      expect(result.current.canAccessRiskDashboard).toBe(false)
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessAdministration true and canAccessRiskDashboard false when only admin probe resolves', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetUMDashboardApiCall.mockRejectedValue(new Error('Forbidden'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(true)
      expect(result.current.canAccessRiskDashboard).toBe(false)
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessAdministration false and canAccessRiskDashboard true when only risk probe resolves', async () => {
    mockGetFunctionalRoles.mockRejectedValue(new Error('Forbidden'))
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)
    mockGetUMDashboardApiCall.mockRejectedValue(new Error('Forbidden'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(false)
      expect(result.current.canAccessRiskDashboard).toBe(true)
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessUMDashboard true when UM probe resolves with 200', async () => {
    mockGetFunctionalRoles.mockRejectedValue(new Error('Forbidden'))
    mockGetRiskDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetUMDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(true)
    })
  })

  it('sets canAccessUMDashboard false when UM probe rejects with an HTTP error response', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)
    mockGetUMDashboardApiCall.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessUMDashboard false when UM probe fails with network error', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)
    mockGetUMDashboardApiCall.mockRejectedValue(new Error('Network Error'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })
})

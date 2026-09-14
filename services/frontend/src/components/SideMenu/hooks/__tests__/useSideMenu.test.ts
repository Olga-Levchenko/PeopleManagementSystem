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

vi.mock('@/api/dmPmDashboard', () => ({
  getDMPMDashboardApiCall: vi.fn(),
}))

vi.mock('@/api/ppDashboard', () => ({
  getPPDashboardApiCall: vi.fn(),
}))

import { getFunctionalRoles } from '@/api/functionalRoles'
import { getRiskDashboardApiCall } from '@/api/riskDashboard'
import { getUMDashboardApiCall } from '@/api/umDashboard'
import { getDMPMDashboardApiCall } from '@/api/dmPmDashboard'
import { getPPDashboardApiCall } from '@/api/ppDashboard'

const mockGetFunctionalRoles = vi.mocked(getFunctionalRoles)
const mockGetRiskDashboardApiCall = vi.mocked(getRiskDashboardApiCall)
const mockGetUMDashboardApiCall = vi.mocked(getUMDashboardApiCall)
const mockGetDMPMDashboardApiCall = vi.mocked(getDMPMDashboardApiCall)
const mockGetPPDashboardApiCall = vi.mocked(getPPDashboardApiCall)

describe('useSideMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all probes reject so tests are explicit about what they grant
    mockGetFunctionalRoles.mockRejectedValue(new Error('Forbidden'))
    mockGetRiskDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetUMDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetDMPMDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
    mockGetPPDashboardApiCall.mockRejectedValue(new Error('Forbidden'))
  })

  it('sets all flags to true when all probes resolve', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)
    mockGetUMDashboardApiCall.mockResolvedValue({} as never)
    mockGetDMPMDashboardApiCall.mockResolvedValue({} as never)
    mockGetPPDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(true)
      expect(result.current.canAccessRiskDashboard).toBe(true)
      expect(result.current.canAccessUMDashboard).toBe(true)
      expect(result.current.canAccessDMPMDashboard).toBe(true)
      expect(result.current.canAccessPPDashboard).toBe(true)
    })
  })

  it('sets all flags to false when all probes reject', async () => {
    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(false)
      expect(result.current.canAccessRiskDashboard).toBe(false)
      expect(result.current.canAccessUMDashboard).toBe(false)
      expect(result.current.canAccessDMPMDashboard).toBe(false)
      expect(result.current.canAccessPPDashboard).toBe(false)
    })
  })

  it('sets canAccessAdministration true and canAccessRiskDashboard false when only admin probe resolves', async () => {
    mockGetFunctionalRoles.mockResolvedValue({ roles: [] } as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(true)
      expect(result.current.canAccessRiskDashboard).toBe(false)
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessAdministration false and canAccessRiskDashboard true when only risk probe resolves', async () => {
    mockGetRiskDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessAdministration).toBe(false)
      expect(result.current.canAccessRiskDashboard).toBe(true)
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessUMDashboard true when UM probe resolves with 200', async () => {
    mockGetUMDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(true)
    })
  })

  it('sets canAccessUMDashboard false when UM probe rejects with an HTTP error response', async () => {
    mockGetUMDashboardApiCall.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessUMDashboard false when UM probe fails with network error', async () => {
    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessUMDashboard).toBe(false)
    })
  })

  it('sets canAccessDMPMDashboard true when DM/PM probe resolves with 200', async () => {
    mockGetDMPMDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessDMPMDashboard).toBe(true)
    })
  })

  it('sets canAccessDMPMDashboard false when DM/PM probe rejects with 403', async () => {
    mockGetDMPMDashboardApiCall.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessDMPMDashboard).toBe(false)
    })
  })

  it('sets canAccessDMPMDashboard false when DM/PM probe fails with any error', async () => {
    mockGetDMPMDashboardApiCall.mockRejectedValue(new Error('Network Error'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessDMPMDashboard).toBe(false)
    })
  })

  it('sets canAccessPPDashboard true when PP probe resolves with 200', async () => {
    mockGetPPDashboardApiCall.mockResolvedValue({} as never)

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessPPDashboard).toBe(true)
    })
  })

  it('sets canAccessPPDashboard false when PP probe rejects with 403', async () => {
    mockGetPPDashboardApiCall.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessPPDashboard).toBe(false)
    })
  })

  it('sets canAccessPPDashboard false when PP probe fails with any error', async () => {
    mockGetPPDashboardApiCall.mockRejectedValue(new Error('Network Error'))

    const { result } = renderHook(() => useSideMenu())

    await waitFor(() => {
      expect(result.current.canAccessPPDashboard).toBe(false)
    })
  })
})

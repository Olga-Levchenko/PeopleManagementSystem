import { useEffect, useState } from 'react'
import { getFunctionalRoles } from '@/api/functionalRoles'
import { getDMPMDashboardApiCall } from '@/api/dmPmDashboard'
import { getPPDashboardApiCall } from '@/api/ppDashboard'
import { getRiskDashboardApiCall } from '@/api/riskDashboard'
import { getUMDashboardApiCall } from '@/api/umDashboard'

interface UseSideMenuResult {
  canAccessAdministration: boolean
  canAccessRiskDashboard: boolean
  canAccessUMDashboard: boolean
  canAccessDMPMDashboard: boolean
  canAccessPPDashboard: boolean
}

export const useSideMenu = (): UseSideMenuResult => {
  const [canAccessAdministration, setCanAccessAdministration] = useState(false)
  const [canAccessRiskDashboard, setCanAccessRiskDashboard] = useState(false)
  const [canAccessUMDashboard, setCanAccessUMDashboard] = useState(false)
  const [canAccessDMPMDashboard, setCanAccessDMPMDashboard] = useState(false)
  const [canAccessPPDashboard, setCanAccessPPDashboard] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    void getFunctionalRoles(controller.signal)
      .then(() => setCanAccessAdministration(true))
      .catch(() => setCanAccessAdministration(false))

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void getRiskDashboardApiCall({ pageSize: 1 }, controller.signal)
      .then(() => setCanAccessRiskDashboard(true))
      .catch(() => setCanAccessRiskDashboard(false))

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void getUMDashboardApiCall({ pageSize: 1 }, controller.signal)
      .then(() => setCanAccessUMDashboard(true))
      .catch(() => setCanAccessUMDashboard(false))

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void getDMPMDashboardApiCall(controller.signal)
      .then(() => setCanAccessDMPMDashboard(true))
      .catch(() => setCanAccessDMPMDashboard(false))

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void getPPDashboardApiCall(controller.signal)
      .then(() => setCanAccessPPDashboard(true))
      .catch(() => setCanAccessPPDashboard(false))

    return () => controller.abort()
  }, [])

  return {
    canAccessAdministration,
    canAccessRiskDashboard,
    canAccessUMDashboard,
    canAccessDMPMDashboard,
    canAccessPPDashboard,
  }
}

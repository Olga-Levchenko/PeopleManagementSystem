import { useEffect, useState } from 'react'
import { getFunctionalRoles } from '@/api/functionalRoles'
import { getRiskDashboardApiCall } from '@/api/riskDashboard'

interface UseSideMenuResult {
  canAccessAdministration: boolean
  canAccessRiskDashboard: boolean
}

export const useSideMenu = (): UseSideMenuResult => {
  const [canAccessAdministration, setCanAccessAdministration] = useState(false)
  const [canAccessRiskDashboard, setCanAccessRiskDashboard] = useState(false)

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

  return { canAccessAdministration, canAccessRiskDashboard }
}

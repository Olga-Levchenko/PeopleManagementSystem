import axios from 'axios'
import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { type RiskSeverity } from '@/api/riskDashboard'
import { useRiskDashboard } from '@/api/hooks/useRiskDashboard'

const severities: RiskSeverity[] = ['leaver', 'high', 'medium', 'need_attention', 'low']
const emphasized = new Set<RiskSeverity>(['leaver', 'high', 'medium'])

export const RiskDashboardPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [severity, setSeverity] = useState<RiskSeverity | undefined>()
  const [departmentId, setDepartmentId] = useState<string>()
  const [projectId, setProjectId] = useState<string>()
  const [peoplePartnerId, setPeoplePartnerId] = useState<string>()
  const [managerId, setManagerId] = useState<string>()
  const dashboard = useRiskDashboard({
    severity,
    departmentId,
    projectId,
    peoplePartnerId,
    managerId,
  })
  const forbidden = axios.isAxiosError(dashboard.error) && dashboard.error.response?.status === 403

  if (forbidden) return null

  const catalogs = dashboard.data?.catalogs
  const setFilter = (value: string, setter: (next: string | undefined) => void) =>
    setter(value || undefined)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('riskDashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('riskDashboard.description')}</p>
        </div>
      </div>

      {dashboard.isLoading ? (
        <p className="text-muted-foreground">{t('riskDashboard.loading')}</p>
      ) : dashboard.isError ? (
        <p className="text-destructive">{t('riskDashboard.error')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <button
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-left"
              onClick={() => setSeverity(undefined)}
            >
              <span className="block text-sm text-muted-foreground">
                {t('riskDashboard.activeCount')}
              </span>
              <span className="text-2xl font-semibold">
                {dashboard.data?.counts.activeCount ?? 0}
              </span>
            </button>
            {severities.map(level => (
              <button
                key={level}
                type="button"
                className="rounded-lg border border-border bg-card p-4 text-left"
                onClick={() => setSeverity(level)}
              >
                <span className="block text-sm text-muted-foreground">
                  {t(`riskDashboard.severity.${level}`)}
                </span>
                <span
                  className={
                    emphasized.has(level) ? 'text-2xl font-bold' : 'text-2xl font-semibold'
                  }
                >
                  {dashboard.data?.counts[level] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-card p-4">
            <select
              aria-label={t('riskDashboard.filters.department')}
              value={departmentId ?? ''}
              onChange={event => setFilter(event.target.value, setDepartmentId)}
            >
              <option value="">{t('riskDashboard.filters.department')}</option>
              {catalogs?.departments.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label={t('riskDashboard.filters.project')}
              value={projectId ?? ''}
              onChange={event => setFilter(event.target.value, setProjectId)}
            >
              <option value="">{t('riskDashboard.filters.project')}</option>
              {catalogs?.projects.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label={t('riskDashboard.filters.peoplePartner')}
              value={peoplePartnerId ?? ''}
              onChange={event => setFilter(event.target.value, setPeoplePartnerId)}
            >
              <option value="">{t('riskDashboard.filters.peoplePartner')}</option>
              {catalogs?.peoplePartners.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label={t('riskDashboard.filters.manager')}
              value={managerId ?? ''}
              onChange={event => setFilter(event.target.value, setManagerId)}
            >
              <option value="">{t('riskDashboard.filters.manager')}</option>
              {catalogs?.managers.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {(dashboard.data?.rows.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">{t('riskDashboard.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th aria-sort="none" className="px-4 py-3 text-left">
                      {t('riskDashboard.columns.person')}
                    </th>
                    <th aria-sort="none" className="px-4 py-3 text-left">
                      {t('riskDashboard.columns.severity')}
                    </th>
                    <th aria-sort="none" className="px-4 py-3 text-left">
                      {t('riskDashboard.columns.trend')}
                    </th>
                    <th aria-sort="descending" className="px-4 py-3 text-left">
                      {t('riskDashboard.columns.recordedAt')}
                    </th>
                    <th aria-sort="none" className="px-4 py-3 text-left">
                      {t('riskDashboard.columns.department')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data?.rows.map(row => (
                    <tr
                      key={row.personId}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => navigate(`/people/${row.personId}`)}
                    >
                      <td className="px-4 py-3">{row.fullName}</td>
                      <td className="px-4 py-3">{t(`riskDashboard.severity.${row.severity}`)}</td>
                      <td className="px-4 py-3">
                        {row.trendDirection === 'up' ? (
                          <ArrowUp aria-label={t('riskDashboard.trend.up')} className="h-4 w-4" />
                        ) : row.trendDirection === 'down' ? (
                          <ArrowDown
                            aria-label={t('riskDashboard.trend.down')}
                            className="h-4 w-4"
                          />
                        ) : (
                          t('riskDashboard.trend.none')
                        )}
                      </td>
                      <td className="px-4 py-3">{row.recordedAt.slice(0, 10)}</td>
                      <td className="px-4 py-3">{row.department?.label ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

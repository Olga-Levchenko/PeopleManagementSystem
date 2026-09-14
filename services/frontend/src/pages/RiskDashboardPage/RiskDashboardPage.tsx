import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type RiskSeverity, type RiskDashboardRow } from '@/api/riskDashboard'
import { DashboardCountCard } from '@/components/DashboardCountCard/DashboardCountCard'
import { DashboardTable, type ColumnSpec } from '@/components/DashboardTable/DashboardTable'
import { SeverityBadge } from '@/components/SeverityBadge/SeverityBadge'
import { TrendIcon } from '@/components/TrendIcon/TrendIcon'
import { useRiskDashboardPage } from './hooks/useRiskDashboardPage'

const severities: RiskSeverity[] = ['leaver', 'high', 'medium', 'need_attention', 'low']
const emphasized = new Set<RiskSeverity>(['leaver', 'high', 'medium'])

export const RiskDashboardPage = () => {
  const { t } = useTranslation()
  const {
    filters,
    setFilter,
    setSeverity,
    setDepartmentId,
    setProjectId,
    setPeoplePartnerId,
    setManagerId,
    isUnauthorized,
    navigateToProfile,
    isLoading,
    isError,
    data,
  } = useRiskDashboardPage()

  const columns = useMemo<ColumnSpec<RiskDashboardRow>[]>(
    () => [
      {
        key: 'person',
        header: t('riskDashboard.columns.person'),
        sortable: true,
        render: row => row.fullName,
      },
      {
        key: 'severity',
        header: t('riskDashboard.columns.severity'),
        sortable: true,
        render: row => <SeverityBadge level={row.severity} />,
      },
      {
        key: 'trend',
        header: t('riskDashboard.columns.trend'),
        render: row => <TrendIcon direction={row.trendDirection ?? 'none'} />,
      },
      {
        key: 'recordedAt',
        header: t('riskDashboard.columns.recordedAt'),
        sortable: true,
        render: row => row.recordedAt.slice(0, 10),
      },
      {
        key: 'department',
        header: t('riskDashboard.columns.department'),
        sortable: true,
        render: row => row.department?.label ?? '—',
      },
    ],
    [t],
  )

  if (isUnauthorized) return null

  const catalogs = data?.catalogs

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('riskDashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('riskDashboard.description')}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('riskDashboard.loading')}</p>
      ) : isError ? (
        <p className="text-destructive">{t('riskDashboard.error')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <DashboardCountCard
              label={t('riskDashboard.activeCount')}
              count={data?.counts.activeCount ?? 0}
              active={filters.severity === undefined}
              onClick={() => setSeverity(undefined)}
            />
            {severities.map(level => (
              <DashboardCountCard
                key={level}
                label={t(`dashboard.common.severity.${level}`)}
                count={data?.counts[level] ?? 0}
                emphasized={emphasized.has(level)}
                active={filters.severity === level}
                onClick={() => setSeverity(level)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-card p-4">
            <select
              aria-label={t('riskDashboard.filters.department')}
              value={filters.departmentId ?? ''}
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
              value={filters.projectId ?? ''}
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
              value={filters.peoplePartnerId ?? ''}
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
              value={filters.managerId ?? ''}
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

          <DashboardTable
            columns={columns}
            rows={data?.rows ?? []}
            getRowKey={row => row.personId}
            onRowClick={row => navigateToProfile(row.personId)}
            emptyMessage={t('riskDashboard.empty')}
          />
        </>
      )}
    </div>
  )
}

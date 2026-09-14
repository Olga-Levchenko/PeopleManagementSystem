import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type RiskSeverity } from '@/api/riskDashboard'
import { type UMDashboardRow } from '@/api/umDashboard'
import { DashboardCountCard } from '@/components/DashboardCountCard/DashboardCountCard'
import { DashboardTable, type ColumnSpec } from '@/components/DashboardTable/DashboardTable'
import { SeverityBadge } from '@/components/SeverityBadge/SeverityBadge'
import { cn } from '@/lib/utils'
import { useUMDashboardPage } from './hooks/useUMDashboardPage'

const riskLevels: RiskSeverity[] = ['leaver', 'high', 'medium', 'need_attention', 'low']

export const UMDashboardPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, isError, isUnauthorized, navigateToProfile } = useUMDashboardPage()

  useEffect(() => {
    if (isUnauthorized) {
      navigate('/')
    }
  }, [isUnauthorized, navigate])

  const columns = useMemo<ColumnSpec<UMDashboardRow>[]>(
    () => [
      {
        key: 'name',
        header: t('dashboard.um.columns.name'),
        sortable: false,
        render: row => row.fullName,
      },
      {
        key: 'severity',
        header: t('dashboard.um.columns.severity'),
        sortable: false,
        render: row =>
          row.severity ? <SeverityBadge level={row.severity as RiskSeverity} /> : '—',
      },
      {
        key: 'project',
        header: t('dashboard.um.columns.project'),
        sortable: false,
        render: row => row.projects[0]?.label ?? '—',
      },
      {
        key: 'leave',
        header: t('dashboard.um.columns.leave'),
        sortable: false,
        render: row => row.leaveStatus ?? '—',
      },
    ],
    [t],
  )

  if (isUnauthorized) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('dashboard.um.title')}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('dashboard.um.loading')}</p>
      ) : isError ? (
        <p className="text-destructive">{t('dashboard.um.error')}</p>
      ) : (
        <>
          {/* Counter cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <DashboardCountCard
              label={t('dashboard.um.headcount')}
              count={data?.headcount ?? 0}
            />
            {riskLevels.map(level => (
              <DashboardCountCard
                key={level}
                label={t(`dashboard.common.severity.${level}`)}
                count={data?.riskCounts[level] ?? 0}
              />
            ))}
            <DashboardCountCard
              label={t('dashboard.um.actionItemCounts.open')}
              count={data?.actionItemCounts.open ?? 0}
            />
            <DashboardCountCard
              label={t('dashboard.um.actionItemCounts.overdue')}
              count={data?.actionItemCounts.overdue ?? 0}
              emphasized
            />
          </div>

          {/* Subordinates table */}
          <DashboardTable
            columns={columns}
            rows={data?.rows ?? []}
            getRowKey={row => row.personId}
            onRowClick={row => navigateToProfile(row.personId)}
            emptyMessage={t('dashboard.um.empty.subordinates')}
          />

          {/* Own action items */}
          <section aria-label={t('dashboard.um.ownActionItems.title')}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              {t('dashboard.um.ownActionItems.title')}
            </h2>
            {(data?.ownActionItems ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                {t('dashboard.um.empty.actionItems')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(data?.ownActionItems ?? []).map(item => (
                  <li
                    key={item.id}
                    className={cn(
                      'rounded-lg border border-border bg-card px-4 py-3 text-sm',
                      item.isOverdue && 'border-destructive/40 bg-destructive/5',
                    )}
                  >
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="ml-3 text-muted-foreground">
                      {t('dashboard.um.ownActionItems.due', { date: item.dueDate.slice(0, 10) })}
                    </span>
                    {item.isOverdue && (
                      <span className="ml-2 text-xs font-semibold text-destructive">
                        {t('dashboard.um.ownActionItems.overdue')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type RiskSeverity } from '@/api/riskDashboard'
import { type PPDashboardRow } from '@/api/ppDashboard'
import { DashboardCountCard } from '@/components/DashboardCountCard/DashboardCountCard'
import { DashboardTable, type ColumnSpec } from '@/components/DashboardTable/DashboardTable'
import { SeverityBadge } from '@/components/SeverityBadge/SeverityBadge'
import { cn } from '@/lib/utils'
import { usePPDashboardPage } from './hooks/usePPDashboardPage'

const riskLevels: RiskSeverity[] = ['leaver', 'high', 'medium', 'need_attention', 'low']

export const PPDashboardPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    data,
    isLoading,
    isError,
    isUnauthorized,
    navigateToProfile,
    groupBy,
    setGroupBy,
    groupedRows,
    headcount,
    riskCounts,
    actionItemCounts,
  } = usePPDashboardPage()

  useEffect(() => {
    if (isUnauthorized) {
      navigate('/')
    }
  }, [isUnauthorized, navigate])

  const columns = useMemo<ColumnSpec<PPDashboardRow>[]>(
    () => [
      {
        key: 'name',
        header: t('dashboard.pp.columns.name'),
        sortable: false,
        render: row => row.fullName,
      },
      {
        key: 'severity',
        header: t('dashboard.pp.columns.severity'),
        sortable: false,
        render: row =>
          row.severity ? <SeverityBadge level={row.severity} /> : '—',
      },
      {
        key: 'leave',
        header: t('dashboard.pp.columns.leave'),
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
            {t('dashboard.pp.title')}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('dashboard.pp.loading')}</p>
      ) : isError ? (
        <p className="text-destructive">{t('dashboard.pp.error')}</p>
      ) : (
        <>
          {/* Grouping toggle */}
          <div>
            <label
              htmlFor="pp-groupby-selector"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {t('dashboard.pp.groupBy.label')}
            </label>
            <select
              id="pp-groupby-selector"
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as 'department' | 'project')}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="department">{t('dashboard.pp.groupBy.department')}</option>
              <option value="project">{t('dashboard.pp.groupBy.project')}</option>
            </select>
          </div>

          {/* Counter cards — always reflect the full PP population */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <DashboardCountCard
              label={t('dashboard.pp.headcount')}
              count={headcount}
            />
            {riskLevels.map(level => (
              <DashboardCountCard
                key={level}
                label={t(`dashboard.pp.riskCounts.${level}`)}
                count={riskCounts[level] ?? 0}
              />
            ))}
            <DashboardCountCard
              label={t('dashboard.pp.actionItemCounts.open')}
              count={actionItemCounts.open}
            />
            <DashboardCountCard
              label={t('dashboard.pp.actionItemCounts.overdue')}
              count={actionItemCounts.overdue}
              emphasized
            />
          </div>

          {/* Grouped tables */}
          {groupedRows.map(group => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                {group.label}
              </h2>
              <DashboardTable
                columns={columns}
                rows={group.rows}
                getRowKey={row => `${group.label}-${row.personId}`}
                onRowClick={row => navigateToProfile(row.personId)}
                emptyMessage={t('dashboard.pp.empty.members')}
              />
            </section>
          ))}

          {groupedRows.length === 0 && (
            <p className="text-muted-foreground">{t('dashboard.pp.empty.members')}</p>
          )}

          {/* Own action items */}
          <section aria-label={t('dashboard.pp.ownActionItems.title')}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              {t('dashboard.pp.ownActionItems.title')}
            </h2>
            {(data?.ownActionItems ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                {t('dashboard.pp.empty.actionItems')}
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
                      {t('dashboard.pp.ownActionItems.due', { date: item.dueDate.slice(0, 10) })}
                    </span>
                    {item.isOverdue && (
                      <span className="ml-2 text-xs font-semibold text-destructive">
                        {t('dashboard.pp.ownActionItems.overdue')}
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

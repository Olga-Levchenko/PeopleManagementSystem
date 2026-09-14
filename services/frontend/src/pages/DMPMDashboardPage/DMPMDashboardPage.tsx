import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type RiskSeverity } from '@/api/riskDashboard'
import { type DMPMDashboardRow } from '@/api/dmPmDashboard'
import { DashboardCountCard } from '@/components/DashboardCountCard/DashboardCountCard'
import { DashboardTable, type ColumnSpec } from '@/components/DashboardTable/DashboardTable'
import { SeverityBadge } from '@/components/SeverityBadge/SeverityBadge'
import { cn } from '@/lib/utils'
import { useDMPMDashboardPage } from './hooks/useDMPMDashboardPage'

const riskLevels: RiskSeverity[] = ['leaver', 'high', 'medium', 'need_attention', 'low']

export const DMPMDashboardPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    data,
    isLoading,
    isError,
    isUnauthorized,
    navigateToProfile,
    selectedProjectId,
    setSelectedProjectId,
    activeProjects,
    activeRiskCounts,
    activeTotalPeople,
  } = useDMPMDashboardPage()

  useEffect(() => {
    if (isUnauthorized) {
      navigate('/')
    }
  }, [isUnauthorized, navigate])

  const columns = useMemo<ColumnSpec<DMPMDashboardRow>[]>(
    () => [
      {
        key: 'name',
        header: t('dashboard.dmpm.columns.name'),
        sortable: false,
        render: row => row.fullName,
      },
      {
        key: 'severity',
        header: t('dashboard.dmpm.columns.severity'),
        sortable: false,
        render: row =>
          row.severity ? <SeverityBadge level={row.severity} /> : '—',
      },
      {
        key: 'leave',
        header: t('dashboard.dmpm.columns.leave'),
        sortable: false,
        render: row => row.leaveStatus ?? '—',
      },
    ],
    [t],
  )

  if (isUnauthorized) return null

  const allProjects = data?.projects ?? []
  // Flatten rows from active projects for table display
  const activeRows = activeProjects.flatMap((p) => p.rows)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('dashboard.dmpm.title')}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('dashboard.dmpm.loading')}</p>
      ) : isError ? (
        <p className="text-destructive">{t('dashboard.dmpm.error')}</p>
      ) : (
        <>
          {/* Project selector */}
          <div>
            <label
              htmlFor="dmpm-project-selector"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {t('dashboard.dmpm.projectSelector.label')}
            </label>
            <select
              id="dmpm-project-selector"
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">{t('dashboard.dmpm.projectSelector.all')}</option>
              {allProjects.map(project => (
                <option key={project.projectId} value={project.projectId}>
                  {project.projectLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Counter cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <DashboardCountCard
              label={t('dashboard.dmpm.totalPeople')}
              count={activeTotalPeople}
            />
            {riskLevels.map(level => (
              <DashboardCountCard
                key={level}
                label={t(`dashboard.dmpm.riskCounts.${level}`)}
                count={activeRiskCounts[level] ?? 0}
              />
            ))}
            <DashboardCountCard
              label={t('dashboard.dmpm.actionItemCounts.open')}
              count={data?.actionItemCounts.open ?? 0}
            />
            <DashboardCountCard
              label={t('dashboard.dmpm.actionItemCounts.overdue')}
              count={data?.actionItemCounts.overdue ?? 0}
              emphasized
            />
          </div>

          {/* Members table */}
          <DashboardTable
            columns={columns}
            rows={activeRows}
            getRowKey={row => row.personId}
            onRowClick={row => navigateToProfile(row.personId)}
            emptyMessage={t('dashboard.dmpm.empty.members')}
          />

          {/* Own action items */}
          <section aria-label={t('dashboard.dmpm.ownActionItems.title')}>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              {t('dashboard.dmpm.ownActionItems.title')}
            </h2>
            {(data?.ownActionItems ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                {t('dashboard.dmpm.empty.actionItems')}
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
                      {t('dashboard.dmpm.ownActionItems.due', { date: item.dueDate.slice(0, 10) })}
                    </span>
                    {item.isOverdue && (
                      <span className="ml-2 text-xs font-semibold text-destructive">
                        {t('dashboard.dmpm.ownActionItems.overdue')}
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

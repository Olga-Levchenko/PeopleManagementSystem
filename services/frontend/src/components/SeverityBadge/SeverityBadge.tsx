import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { type RiskSeverity } from '@/api/riskDashboard'

interface SeverityBadgeProps {
  level: RiskSeverity
  className?: string
}

const severityColorClass: Record<RiskSeverity, string> = {
  low: 'bg-chart-2/20 text-chart-2',
  need_attention: 'bg-chart-4/20 text-chart-4',
  medium: 'bg-chart-5/20 text-chart-5',
  high: 'bg-destructive/20 text-destructive',
  leaver: 'bg-muted text-muted-foreground',
}

export const SeverityBadge = ({ level, className }: SeverityBadgeProps) => {
  const { t } = useTranslation()

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        severityColorClass[level],
        className,
      )}
    >
      {t(`dashboard.common.severity.${level}`)}
    </span>
  )
}

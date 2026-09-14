import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type RiskTrendDirection } from '@/api/riskDashboard'

interface TrendIconProps {
  direction: RiskTrendDirection | 'none'
  className?: string
}

export const TrendIcon = ({ direction, className }: TrendIconProps) => {
  const { t } = useTranslation()

  if (direction === 'up') {
    return (
      <ArrowUp
        aria-label={t('dashboard.common.trend.up')}
        className={className ?? 'h-4 w-4'}
      />
    )
  }

  if (direction === 'down') {
    return (
      <ArrowDown
        aria-label={t('dashboard.common.trend.down')}
        className={className ?? 'h-4 w-4'}
      />
    )
  }

  if (direction === 'none') {
    return (
      <span className="text-sm text-muted-foreground">
        {t('dashboard.common.trend.none')}
      </span>
    )
  }

  return null
}

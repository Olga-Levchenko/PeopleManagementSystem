import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n/config'
import { SeverityBadge } from '../SeverityBadge'
import { type RiskSeverity } from '@/api/riskDashboard'

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)

describe('SeverityBadge', () => {
  const levels: Array<{ level: RiskSeverity; expectedLabel: string }> = [
    { level: 'low', expectedLabel: 'Low' },
    { level: 'need_attention', expectedLabel: 'Needs attention' },
    { level: 'medium', expectedLabel: 'Medium' },
    { level: 'high', expectedLabel: 'High' },
    { level: 'leaver', expectedLabel: 'Leaver' },
  ]

  it.each(levels)('renders label "$expectedLabel" for level "$level"', ({ level, expectedLabel }) => {
    renderWithI18n(<SeverityBadge level={level} />)
    expect(screen.getByText(expectedLabel)).toBeInTheDocument()
  })

  const colorClassMap: Record<string, string> = {
    low: 'bg-chart-2/20 text-chart-2',
    need_attention: 'bg-chart-4/20 text-chart-4',
    medium: 'bg-chart-5/20 text-chart-5',
    high: 'bg-destructive/20 text-destructive',
    leaver: 'bg-muted text-muted-foreground',
  }

  it.each(levels)('applies the correct color class for level "$level"', ({ level }) => {
    const { container } = renderWithI18n(<SeverityBadge level={level} />)
    const badge = container.firstElementChild
    const expectedClasses = colorClassMap[level].split(' ')
    for (const cls of expectedClasses) {
      expect(badge?.className).toContain(cls)
    }
  })
})

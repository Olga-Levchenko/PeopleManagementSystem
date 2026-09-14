import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n/config'
import { TrendIcon } from '../TrendIcon'

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)

describe('TrendIcon', () => {
  it('renders an up arrow with aria-label for direction "up"', () => {
    renderWithI18n(<TrendIcon direction="up" />)
    // Lucide icons render as SVG with the aria-label prop
    const icon = screen.getByLabelText('Increasing')
    expect(icon).toBeInTheDocument()
  })

  it('renders a down arrow with aria-label for direction "down"', () => {
    renderWithI18n(<TrendIcon direction="down" />)
    const icon = screen.getByLabelText('Decreasing')
    expect(icon).toBeInTheDocument()
  })

  it('renders "No change" text for direction "none"', () => {
    renderWithI18n(<TrendIcon direction="none" />)
    expect(screen.getByText('No change')).toBeInTheDocument()
  })
})

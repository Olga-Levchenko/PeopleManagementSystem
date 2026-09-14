import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import i18n from '@/i18n/config'
import { UMDashboardPage } from '../UMDashboardPage'

vi.mock('../hooks/useUMDashboardPage', () => ({
  useUMDashboardPage: vi.fn(),
}))

import { useUMDashboardPage } from '../hooks/useUMDashboardPage'

const mockUseUMDashboardPage = vi.mocked(useUMDashboardPage)

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <UMDashboardPage />
      </I18nextProvider>
    </MemoryRouter>,
  )

const baseHookResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  isUnauthorized: false,
  navigateToProfile: vi.fn(),
}

describe('UMDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders counter cards for headcount, risk levels, and action item counts', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 5,
        riskCounts: { low: 2, need_attention: 1, medium: 1, high: 1, leaver: 0 },
        actionItemCounts: { open: 3, overdue: 1 },
        rows: [],
        ownActionItems: [],
      },
    })

    renderPage()

    expect(screen.getByText('Headcount')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Open action items')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('shows empty subordinates message when there are no direct reports', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 0,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 0, overdue: 0 },
        rows: [],
        ownActionItems: [],
      },
    })

    renderPage()

    expect(screen.getByText('No direct reports found.')).toBeInTheDocument()
  })

  it('shows empty subordinates message while own action items are still rendered', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 0,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 1, overdue: 0 },
        rows: [],
        ownActionItems: [
          {
            id: 'ai-1',
            title: 'Finish review',
            dueDate: '2026-09-20',
            status: 'open',
            isOverdue: false,
          },
        ],
      },
    })

    renderPage()

    expect(screen.getByText('No direct reports found.')).toBeInTheDocument()
    expect(screen.getByText('Finish review')).toBeInTheDocument()
  })

  it('highlights overdue action item rows with a distinct style', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 1,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 1, overdue: 1 },
        rows: [],
        ownActionItems: [
          {
            id: 'ai-overdue',
            title: 'Critical review',
            dueDate: '2026-09-01',
            status: 'open',
            isOverdue: true,
          },
        ],
      },
    })

    const { container } = renderPage()

    // The overdue li carries border-destructive/40 and bg-destructive/5
    const overdueLi = container.querySelector('li')
    expect(overdueLi?.className).toContain('border-destructive')
  })

  it('redirects to home when isUnauthorized is true', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isUnauthorized: true,
    })

    renderPage()

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('renders null content while redirecting (isUnauthorized guard)', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isUnauthorized: true,
    })

    renderPage()

    // Page returns null when isUnauthorized — dashboard title should not be present
    expect(screen.queryByText('UM Dashboard')).not.toBeInTheDocument()
  })

  it('shows loading text while data is loading', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isLoading: true,
    })

    renderPage()

    expect(screen.getByText('Loading UM dashboard...')).toBeInTheDocument()
  })

  it('shows error text when data fails to load', () => {
    mockUseUMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isError: true,
    })

    renderPage()

    expect(
      screen.getByText('Unable to load dashboard data. Please try again.'),
    ).toBeInTheDocument()
  })
})

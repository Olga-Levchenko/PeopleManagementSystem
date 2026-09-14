import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import i18n from '@/i18n/config'
import { PPDashboardPage } from '../PPDashboardPage'

vi.mock('../hooks/usePPDashboardPage', () => ({
  usePPDashboardPage: vi.fn(),
}))

import { usePPDashboardPage } from '../hooks/usePPDashboardPage'

const mockUsePPDashboardPage = vi.mocked(usePPDashboardPage)

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
        <PPDashboardPage />
      </I18nextProvider>
    </MemoryRouter>,
  )

const groupEngineering = {
  label: 'Engineering',
  rows: [
    {
      personId: 'person-1',
      fullName: 'Jordan Kim',
      department: { id: 'dept-1', label: 'Engineering' },
      projects: ['Alpha'],
      severity: 'high' as const,
      trendDirection: 'up' as const,
      leaveStatus: null,
    },
  ],
}

const groupDesign = {
  label: 'Design',
  rows: [
    {
      personId: 'person-2',
      fullName: 'Alex Rivera',
      department: { id: 'dept-2', label: 'Design' },
      projects: [],
      severity: null,
      trendDirection: 'none' as const,
      leaveStatus: 'Annual',
    },
  ],
}

const baseHookResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  isUnauthorized: false,
  navigateToProfile: vi.fn(),
  groupBy: 'department' as const,
  setGroupBy: vi.fn(),
  groupedRows: [],
  headcount: 0,
  riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
  actionItemCounts: { open: 0, overdue: 0 },
}

describe('PPDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders counter cards using global counts regardless of active group', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 5,
        riskCounts: { low: 1, need_attention: 0, medium: 2, high: 1, leaver: 0 },
        actionItemCounts: { open: 3, overdue: 1 },
        rows: [...groupEngineering.rows, ...groupDesign.rows],
        ownActionItems: [],
      },
      groupedRows: [groupEngineering],
      headcount: 5,
      riskCounts: { low: 1, need_attention: 0, medium: 2, high: 1, leaver: 0 },
      actionItemCounts: { open: 3, overdue: 1 },
    })

    renderPage()

    // Headcount card shows global value, not just the one group rendered
    expect(screen.getByText('Headcount')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Open action items')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders groupBy toggle defaulting to department', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      groupedRows: [groupEngineering],
      headcount: 1,
      riskCounts: { low: 0, need_attention: 0, medium: 0, high: 1, leaver: 0 },
    })

    renderPage()

    const selector = screen.getByRole('combobox')
    expect(selector).toBeInTheDocument()
    expect(screen.getByText('By department')).toBeInTheDocument()
    expect(screen.getByText('By project')).toBeInTheDocument()
  })

  it('calls setGroupBy when toggle value changes', () => {
    const setGroupBy = vi.fn()
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      setGroupBy,
      groupedRows: [groupEngineering],
    })

    renderPage()

    const selector = screen.getByRole('combobox')
    fireEvent.change(selector, { target: { value: 'project' } })
    expect(setGroupBy).toHaveBeenCalledWith('project')
  })

  it('renders group headers and their rows without a network call on toggle', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      groupedRows: [groupEngineering, groupDesign],
      headcount: 2,
    })

    renderPage()

    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
    expect(screen.getByText('Jordan Kim')).toBeInTheDocument()
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument()
  })

  it('shows empty group message when a group has no rows', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      groupedRows: [],
    })

    renderPage()

    expect(screen.getByText('No people found.')).toBeInTheDocument()
  })

  it('highlights overdue own action item rows with destructive style', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        headcount: 1,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 1, overdue: 1 },
        rows: groupEngineering.rows,
        ownActionItems: [
          {
            id: 'ai-1',
            title: 'Critical delivery',
            dueDate: '2026-09-01',
            status: 'open',
            isOverdue: true,
          },
        ],
      },
      groupedRows: [groupEngineering],
      headcount: 1,
      riskCounts: { low: 0, need_attention: 0, medium: 0, high: 1, leaver: 0 },
      actionItemCounts: { open: 1, overdue: 1 },
    })

    const { container } = renderPage()

    expect(screen.getByText('Critical delivery')).toBeInTheDocument()
    const overdueLi = container.querySelector('li')
    expect(overdueLi?.className).toContain('border-destructive')
  })

  it('redirects to home when isUnauthorized is true', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      isUnauthorized: true,
    })

    renderPage()

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows loading text while data is loading', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      isLoading: true,
    })

    renderPage()

    expect(screen.getByText('Loading PP dashboard...')).toBeInTheDocument()
  })

  it('shows error text when data fails to load', () => {
    mockUsePPDashboardPage.mockReturnValue({
      ...baseHookResult,
      isError: true,
    })

    renderPage()

    expect(
      screen.getByText('Unable to load dashboard data. Please try again.'),
    ).toBeInTheDocument()
  })
})

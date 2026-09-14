import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import i18n from '@/i18n/config'
import { DMPMDashboardPage } from '../DMPMDashboardPage'

vi.mock('../hooks/useDMPMDashboardPage', () => ({
  useDMPMDashboardPage: vi.fn(),
}))

import { useDMPMDashboardPage } from '../hooks/useDMPMDashboardPage'

const mockUseDMPMDashboardPage = vi.mocked(useDMPMDashboardPage)

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
        <DMPMDashboardPage />
      </I18nextProvider>
    </MemoryRouter>,
  )

const projectAlpha = {
  projectId: 'project-alpha',
  projectLabel: 'Alpha',
  rows: [
    {
      personId: 'person-1',
      fullName: 'Morgan Ellis',
      severity: 'high' as const,
      trendDirection: 'up' as const,
      leaveStatus: null,
    },
  ],
}

const projectBeta = {
  projectId: 'project-beta',
  projectLabel: 'Beta',
  rows: [
    {
      personId: 'person-2',
      fullName: 'Jordan Park',
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
  selectedProjectId: 'all' as string | 'all',
  setSelectedProjectId: vi.fn(),
  activeProjects: [],
  activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
  activeTotalPeople: 0,
}

describe('DMPMDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders counter cards with aggregated counts', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        totalPeople: 2,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 1, leaver: 0 },
        actionItemCounts: { open: 3, overdue: 1 },
        projects: [projectAlpha, projectBeta],
        ownActionItems: [],
      },
      activeProjects: [projectAlpha, projectBeta],
      activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 1, leaver: 0 },
      activeTotalPeople: 2,
    })

    renderPage()

    expect(screen.getByText('Total people')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Open action items')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('renders project selector with All projects option', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        totalPeople: 2,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 0, overdue: 0 },
        projects: [projectAlpha, projectBeta],
        ownActionItems: [],
      },
      activeProjects: [projectAlpha, projectBeta],
      activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
      activeTotalPeople: 2,
    })

    renderPage()

    const selector = screen.getByRole('combobox')
    expect(selector).toBeInTheDocument()
    expect(screen.getByText('All projects')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('calls setSelectedProjectId when a project is selected', () => {
    const setSelectedProjectId = vi.fn()
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        totalPeople: 2,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 0, overdue: 0 },
        projects: [projectAlpha, projectBeta],
        ownActionItems: [],
      },
      activeProjects: [projectAlpha, projectBeta],
      activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
      activeTotalPeople: 2,
      setSelectedProjectId,
    })

    renderPage()

    const selector = screen.getByRole('combobox')
    fireEvent.change(selector, { target: { value: 'project-alpha' } })
    expect(setSelectedProjectId).toHaveBeenCalledWith('project-alpha')
  })

  it('shows empty members message when active projects have no rows', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        totalPeople: 0,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 0, overdue: 0 },
        projects: [],
        ownActionItems: [],
      },
      activeProjects: [],
      activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
      activeTotalPeople: 0,
    })

    renderPage()

    expect(screen.getByText('No team members found.')).toBeInTheDocument()
  })

  it('highlights overdue own action item rows with destructive style', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      data: {
        totalPeople: 1,
        riskCounts: { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0 },
        actionItemCounts: { open: 1, overdue: 1 },
        projects: [projectAlpha],
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
      activeProjects: [projectAlpha],
      activeRiskCounts: { low: 0, need_attention: 0, medium: 0, high: 1, leaver: 0 },
      activeTotalPeople: 1,
    })

    const { container } = renderPage()

    expect(screen.getByText('Critical delivery')).toBeInTheDocument()
    const overdueLi = container.querySelector('li')
    expect(overdueLi?.className).toContain('border-destructive')
  })

  it('redirects to home when isUnauthorized is true', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isUnauthorized: true,
    })

    renderPage()

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows loading text while data is loading', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isLoading: true,
    })

    renderPage()

    expect(screen.getByText('Loading DM/PM dashboard...')).toBeInTheDocument()
  })

  it('shows error text when data fails to load', () => {
    mockUseDMPMDashboardPage.mockReturnValue({
      ...baseHookResult,
      isError: true,
    })

    renderPage()

    expect(screen.getByText('Unable to load dashboard data. Please try again.')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardCountCard } from '../DashboardCountCard'

describe('DashboardCountCard', () => {
  it('renders label and count', () => {
    render(<DashboardCountCard label="Active risks" count={42} />)
    expect(screen.getByText('Active risks')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('calls onClick exactly once when the card is clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    render(<DashboardCountCard label="High" count={5} onClick={handleClick} />)
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('sets aria-pressed when active', () => {
    render(<DashboardCountCard label="High" count={5} active={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sets aria-pressed=false when not active', () => {
    render(<DashboardCountCard label="High" count={5} active={false} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies font-bold class when emphasized', () => {
    const { container } = render(<DashboardCountCard label="High" count={3} emphasized={true} />)
    const countEl = container.querySelector('.font-bold')
    expect(countEl).toBeInTheDocument()
  })

  it('does not apply font-bold when not emphasized', () => {
    const { container } = render(<DashboardCountCard label="Low" count={1} emphasized={false} />)
    const countEl = container.querySelector('.font-bold')
    expect(countEl).toBeNull()
  })
})

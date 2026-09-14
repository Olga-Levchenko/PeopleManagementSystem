import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardTable, type ColumnSpec } from '../DashboardTable'

interface TestRow {
  id: string
  name: string
  score: number
  tag: string
}

const testRows: TestRow[] = [
  { id: 'r1', name: 'Alice Example', score: 10, tag: 'alpha' },
  { id: 'r2', name: 'Bob Sample', score: 20, tag: 'beta' },
]

const allColumns: ColumnSpec<TestRow>[] = [
  { key: 'name', header: 'Name', sortable: true, render: row => row.name },
  { key: 'score', header: 'Score', render: row => String(row.score) },
  { key: 'tag', header: 'Tag', render: row => row.tag },
]

describe('DashboardTable', () => {
  it('renders exactly the declared columns in declared order', () => {
    const threeColumns = allColumns.slice(0, 3)
    render(
      <DashboardTable
        columns={threeColumns}
        rows={testRows}
        getRowKey={row => row.id}
      />,
    )
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(3)
    expect(headers[0]).toHaveTextContent('Name')
    expect(headers[1]).toHaveTextContent('Score')
    expect(headers[2]).toHaveTextContent('Tag')
  })

  it('does not render undeclared columns', () => {
    const twoColumns = allColumns.slice(0, 2)
    render(
      <DashboardTable
        columns={twoColumns}
        rows={testRows}
        getRowKey={row => row.id}
      />,
    )
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    expect(screen.queryByRole('columnheader', { name: 'Tag' })).toBeNull()
  })

  it('renders a row for each item in rows', () => {
    render(
      <DashboardTable
        columns={allColumns}
        rows={testRows}
        getRowKey={row => row.id}
      />,
    )
    expect(screen.getByText('Alice Example')).toBeInTheDocument()
    expect(screen.getByText('Bob Sample')).toBeInTheDocument()
  })

  it('shows emptyMessage when rows is empty', () => {
    render(
      <DashboardTable
        columns={allColumns}
        rows={[]}
        getRowKey={row => row.id}
        emptyMessage="Nothing to show"
      />,
    )
    expect(screen.getByText('Nothing to show')).toBeInTheDocument()
    // table structure is preserved; message appears inside a cell spanning all columns
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryAllByRole('row').length).toBe(2) // header row + empty-state row
  })

  it('sets aria-sort on sortable column headers', () => {
    render(
      <DashboardTable
        columns={allColumns}
        rows={testRows}
        getRowKey={row => row.id}
      />,
    )
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' })
    expect(nameHeader).toHaveAttribute('aria-sort', 'none')
  })

  it('does not set aria-sort on non-sortable column headers', () => {
    render(
      <DashboardTable
        columns={allColumns}
        rows={testRows}
        getRowKey={row => row.id}
      />,
    )
    const scoreHeader = screen.getByRole('columnheader', { name: 'Score' })
    expect(scoreHeader).not.toHaveAttribute('aria-sort')
  })

  it('calls onRowClick with the correct row when a row is clicked', async () => {
    const onRowClick = vi.fn()
    render(
      <DashboardTable
        columns={allColumns}
        rows={testRows}
        getRowKey={row => row.id}
        onRowClick={onRowClick}
      />,
    )
    await userEvent.click(screen.getByText('Alice Example'))
    expect(onRowClick).toHaveBeenCalledOnce()
    expect(onRowClick).toHaveBeenCalledWith(testRows[0])
  })

  it('calls onRowClick when Enter is pressed on a focused row', async () => {
    const onRowClick = vi.fn()
    render(
      <DashboardTable
        columns={allColumns}
        rows={testRows}
        getRowKey={row => row.id}
        onRowClick={onRowClick}
      />,
    )
    // Tab to first data row (rows have tabIndex=0 when onRowClick is provided)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledOnce()
    expect(onRowClick).toHaveBeenCalledWith(testRows[0])
  })
})

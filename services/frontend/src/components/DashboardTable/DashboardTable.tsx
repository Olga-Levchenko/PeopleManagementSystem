import { type ReactNode } from 'react'

export interface ColumnSpec<T> {
  key: string
  header: string
  sortable?: boolean
  render: (row: T) => ReactNode
}

interface DashboardTableProps<T> {
  columns: ColumnSpec<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export const DashboardTable = <T,>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyMessage,
}: DashboardTableProps<T>) => {
  if (rows.length === 0 && emptyMessage) {
    return <p className="text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                aria-sort={col.sortable ? 'none' : undefined}
                className="px-4 py-3 text-left"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={getRowKey(row)}
              className={
                onRowClick
                  ? 'cursor-pointer border-t border-border hover:bg-muted/40'
                  : 'border-t border-border'
              }
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
